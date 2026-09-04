import { createClient, type Client } from '@libsql/client';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  ftsMatchFromUserQuery,
  likeWordsFromUserQuery,
  snippetForSearchResult,
} from '../../shared/searchQuery';
import type {
  Note,
  NoteListItem,
  CreateNoteInput,
  UpdateNoteInput,
  SearchResult,
  INoteStore,
  VaultSnapshot,
} from '../../shared/types';
import { parseStoredTags } from '../../shared/noteTags';
import { migrateRemoteNoteDatabase } from './migrations';
import { serializeNoteMarkdown } from './noteMarkdown';

function isTenantRefUniqueConstraint(err: unknown): boolean {
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.message);
    const c = (err as Error & { cause?: unknown }).cause;
    if (c instanceof Error) parts.push(c.message);
  } else parts.push(String(err));
  const msg = parts.join(' ');
  return msg.includes('UNIQUE constraint failed') && (msg.includes('notes.ref') || msg.includes('tenant_id'));
}

/**
 * Remote async store via @libsql/client (Turso Cloud, self-hosted libSQL/sqld, or any compatible endpoint).
 */
export class TursoNoteStore implements INoteStore {
  private client: Client;
  private vaultPath: string | undefined;

  constructor(url: string, authToken: string, vaultPath?: string) {
    this.client = createClient({ url, authToken });
    this.vaultPath = vaultPath;
  }

  /** Run schema migrations — call once before using the store. */
  async initSchema(): Promise<void> {
    await migrateRemoteNoteDatabase(this.client);
  }

  async create(input: CreateNoteInput): Promise<Note> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const tenantId = input.tenantId ?? 'default';
    const tags = input.tags ?? [];
    const hideHeader = input.hideHeader ? 1 : 0;

    /**
     * Each libSQL `execute` uses its own logical connection, so a separate SELECT MAX + INSERT
     * is not atomic and two concurrent creates can race on the same next ref.
     * Compute ref inside the INSERT so allocation + insert are one statement.
     */
    const sql = `INSERT INTO notes (id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header)
      VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(ref), 0) + 1 FROM notes AS n WHERE n.tenant_id = ?), ?)`;
    const args = [
      id,
      input.title,
      input.body,
      JSON.stringify(tags),
      tenantId,
      now,
      now,
      tenantId,
      hideHeader,
    ] as import('@libsql/client').InValue[];

    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await this.client.execute({ sql, args });
        break;
      } catch (e) {
        if (attempt < 7 && isTenantRefUniqueConstraint(e)) {
          await new Promise(r => setTimeout(r, 15 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }

    const note = await this.read(id);
    if (!note) throw new Error('TursoNoteStore.create: inserted row not read back');
    this.writeMdFile(note);
    return note;
  }

  async read(id: string): Promise<Note | null> {
    const [noteResult, linkResult] = await Promise.all([
      this.client.execute({ sql: 'SELECT * FROM notes WHERE id = ?', args: [id] }),
      this.client.execute({
        sql: 'SELECT target_id FROM note_links WHERE source_id = ?',
        args: [id],
      }),
    ]);
    const row = noteResult.rows[0];
    if (!row) return null;
    return this.rowToNote(
      id,
      row,
      linkResult.rows.map(link => link['target_id'] as string),
    );
  }

  async readByRef(ref: number, tenantId: string = 'default'): Promise<Note | null> {
    const result = await this.client.execute({
      sql: 'SELECT id FROM notes WHERE tenant_id = ? AND ref = ?',
      args: [tenantId, ref],
    });
    const id = result.rows[0]?.['id'] as string | undefined;
    if (!id) return null;
    return this.read(id);
  }

  async update(input: UpdateNoteInput): Promise<Note | null> {
    const existing = await this.read(input.id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const title = input.title ?? existing.title;
    const body = input.body ?? existing.body;
    const tags = input.tags ?? existing.tags;
    const hideHeader = input.hideHeader !== undefined ? input.hideHeader : existing.hideHeader;

    await this.client.execute({
      sql: `UPDATE notes SET title = ?, body = ?, tags = ?, updated_at = ?, hide_header = ? WHERE id = ?`,
      args: [title, body, JSON.stringify(tags), now, hideHeader ? 1 : 0, input.id],
    });

    const note: Note = { ...existing, ref: existing.ref, title, body, tags, modified: now, hideHeader };
    this.writeMdFile(note);
    return note;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: 'DELETE FROM notes WHERE id = ?',
      args: [id],
    });
    if ((result.rowsAffected ?? 0) > 0) {
      if (this.vaultPath) {
        const filePath = path.join(this.vaultPath, `${id}.md`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      return true;
    }
    return false;
  }

  async list(tenantId: string = 'default'): Promise<NoteListItem[]> {
    const result = await this.client.execute({
      sql: `SELECT ref, id, title, body, tags, created_at, updated_at, hide_header
            FROM notes WHERE tenant_id = ? ORDER BY updated_at DESC`,
      args: [tenantId],
    });
    return result.rows.map(row => ({
      ref: row['ref'] as number,
      id: row['id'] as string,
      title: row['title'] as string,
      tags: parseStoredTags(row['tags']),
      created: row['created_at'] as string,
      modified: row['updated_at'] as string,
      snippet: (row['body'] as string).substring(0, 120),
      hideHeader: ((row['hide_header'] as number) ?? 0) === 1,
    }));
  }

  async listNotes(tenantId: string = 'default'): Promise<Note[]> {
    const [noteResult, linkResult] = await Promise.all([
      this.client.execute({
        sql: 'SELECT * FROM notes WHERE tenant_id = ? ORDER BY updated_at DESC',
        args: [tenantId],
      }),
      this.client.execute({
        sql: `SELECT nl.source_id, nl.target_id
              FROM note_links nl
              JOIN notes n ON n.id = nl.source_id
              WHERE n.tenant_id = ?`,
        args: [tenantId],
      }),
    ]);
    const bySource = new Map<string, string[]>();
    for (const row of linkResult.rows) {
      const sourceId = row['source_id'] as string;
      const targets = bySource.get(sourceId) ?? [];
      targets.push(row['target_id'] as string);
      bySource.set(sourceId, targets);
    }
    return noteResult.rows.map(row => {
      const id = row['id'] as string;
      return this.rowToNote(id, row, bySource.get(id) ?? []);
    });
  }

  async search(query: string, tenantId: string = 'default'): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const fts = ftsMatchFromUserQuery(query);
    if (!fts) return [];

    const mapRow = (row: Record<string, unknown>, rank: number): SearchResult => ({
      ref: row['ref'] as number,
      id: row['id'] as string,
      title: row['title'] as string,
      tags: parseStoredTags(row['tags']),
      created: row['created_at'] as string,
      modified: row['updated_at'] as string,
      snippet: snippetForSearchResult(
        row['title'] as string,
        row['body'] as string,
        query,
      ),
      rank,
      hideHeader: ((row['hide_header'] as number) ?? 0) === 1,
    });

    try {
      const result = await this.client.execute({
        sql: `SELECT n.ref, n.id, n.title, n.body, n.tags, n.created_at, n.updated_at,
                     n.hide_header, notes_fts.rank
              FROM notes_fts
              JOIN notes n ON n.rowid = notes_fts.rowid
              WHERE notes_fts MATCH ?
                AND n.tenant_id = ?
              ORDER BY notes_fts.rank
              LIMIT 50`,
        args: [fts, tenantId],
      });
      return result.rows.map(row => mapRow(row as Record<string, unknown>, row['rank'] as number));
    } catch {
      const words = likeWordsFromUserQuery(query);
      if (words.length === 0) return [];
      const conds = words
        .map(() => '(INSTR(LOWER(title), LOWER(?)) > 0 OR INSTR(LOWER(body), LOWER(?)) > 0)')
        .join(' AND ');
      const args: string[] = [tenantId];
      for (const w of words) {
        args.push(w, w);
      }
      const result = await this.client.execute({
        sql: `SELECT ref, id, title, body, tags, created_at, updated_at, hide_header FROM notes
              WHERE tenant_id = ? AND ${conds}
              LIMIT 50`,
        args,
      });
      return result.rows.map((row, i) => mapRow(row as Record<string, unknown>, i));
    }
  }

  async getBacklinks(noteId: string): Promise<NoteListItem[]> {
    const result = await this.client.execute({
      sql: `SELECT n.ref, n.id, n.title, n.body, n.tags, n.created_at, n.updated_at
            FROM note_links nl
            JOIN notes n ON n.id = nl.source_id
            WHERE nl.target_id = ?
            ORDER BY n.updated_at DESC`,
      args: [noteId],
    });
    return result.rows.map(row => ({
      ref: row['ref'] as number,
      id: row['id'] as string,
      title: row['title'] as string,
      tags: parseStoredTags(row['tags']),
      created: row['created_at'] as string,
      modified: row['updated_at'] as string,
      snippet: (row['body'] as string).substring(0, 120),
    }));
  }

  async updateLinks(sourceId: string, targetIds: string[]): Promise<void> {
    await this.updateLinksBatch([{ sourceId, targetIds }]);
  }

  async updateLinksBatch(updates: Array<{ sourceId: string; targetIds: string[] }>): Promise<void> {
    const maxStatements = 256;
    let statements: Array<{ sql: string; args: import('@libsql/client').InValue[] }> = [];
    const flush = async () => {
      if (statements.length === 0) return;
      await this.client.batch(statements, 'write');
      statements = [];
    };
    const pushStatement = async (statement: { sql: string; args: import('@libsql/client').InValue[] }) => {
      if (statements.length >= maxStatements) {
        await flush();
      }
      statements.push(statement);
    };
    for (const { sourceId, targetIds } of updates) {
      await pushStatement({ sql: 'DELETE FROM note_links WHERE source_id = ?', args: [sourceId] });
      for (const targetId of targetIds) {
        await pushStatement({
          sql: 'INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)',
          args: [sourceId, targetId],
        });
      }
    }
    await flush();
  }

  async resolveTitle(title: string, tenantId: string = 'default'): Promise<string | null> {
    const result = await this.client.execute({
      sql: 'SELECT id FROM notes WHERE title = ? AND tenant_id = ? LIMIT 1',
      args: [title, tenantId],
    });
    const row = result.rows[0];
    return row ? (row['id'] as string) : null;
  }

  async getAllLinks(tenantId: string = 'default'): Promise<Array<{ source: string; target: string }>> {
    const result = await this.client.execute({
      sql: `SELECT nl.source_id as source, nl.target_id as target
            FROM note_links nl
            JOIN notes n ON n.id = nl.source_id
            WHERE n.tenant_id = ?`,
      args: [tenantId],
    });
    return result.rows.map(row => ({
      source: row['source'] as string,
      target: row['target'] as string,
    }));
  }

  async getVaultSnapshot(tenantId: string = 'default'): Promise<VaultSnapshot> {
    const result = await this.client.execute({
      sql: `
        SELECT
          (SELECT COUNT(*) FROM notes WHERE tenant_id = ?) AS note_count,
          (SELECT MAX(updated_at) FROM notes WHERE tenant_id = ?) AS max_u,
          (SELECT COUNT(*) FROM note_links nl INNER JOIN notes n ON n.id = nl.source_id WHERE n.tenant_id = ?) AS link_count,
          (SELECT COALESCE(SUM(LENGTH(body) + LENGTH(title) + LENGTH(tags)), 0) FROM notes WHERE tenant_id = ?) AS content_bytes,
          (SELECT MAX(updated_at) FROM app_kv) AS kv_max_u
      `,
      args: [tenantId, tenantId, tenantId, tenantId],
    });
    const row = result.rows[0];
    return {
      noteCount: (row?.['note_count'] as number) ?? 0,
      maxUpdatedAt: (row?.['max_u'] as string) ?? null,
      linkCount: (row?.['link_count'] as number) ?? 0,
      contentBytes: Number(row?.['content_bytes'] ?? 0),
      appKvMaxUpdatedAt: (row?.['kv_max_u'] as string) ?? null,
    };
  }

  /** Key-value settings mirrored with ui-preferences.json (e.g. full UI prefs JSON). */
  async getKv(key: string): Promise<string | null> {
    const r = await this.client.execute({
      sql: 'SELECT value FROM app_kv WHERE key = ?',
      args: [key],
    });
    return (r.rows[0]?.['value'] as string) ?? null;
  }

  /** Value + row timestamp for last-write-wins sync (e.g. workspace-profiles.json vs app_kv). */
  async getKvEntry(key: string): Promise<{ value: string; updatedAt: string } | null> {
    const r = await this.client.execute({
      sql: 'SELECT value, updated_at FROM app_kv WHERE key = ?',
      args: [key],
    });
    const row = r.rows[0];
    if (!row) return null;
    return {
      value: row['value'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  async setKv(key: string, value: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [key, value, now],
    });
  }

  async listDistinctTenantIds(): Promise<string[]> {
    const r = await this.client.execute({
      sql: 'SELECT DISTINCT tenant_id FROM notes',
      args: [],
    });
    return r.rows.map(row => row['tenant_id'] as string);
  }

  async getNoteCountsByTenant(): Promise<Record<string, number>> {
    const r = await this.client.execute({
      sql: 'SELECT tenant_id, COUNT(*) AS c FROM notes GROUP BY tenant_id',
      args: [],
    });
    const out: Record<string, number> = {};
    for (const row of r.rows) {
      out[row['tenant_id'] as string] = Number(row['c'] ?? 0);
    }
    return out;
  }

  async purgeTenantNotes(tenantId: string): Promise<void> {
    const r = await this.client.execute({
      sql: 'SELECT id FROM notes WHERE tenant_id = ?',
      args: [tenantId],
    });
    if (this.vaultPath) {
      for (const row of r.rows) {
        const id = row['id'] as string;
        try {
          fs.unlinkSync(path.join(this.vaultPath, `${id}.md`));
        } catch {
          /* missing */
        }
      }
    }
    await this.client.execute({
      sql: 'DELETE FROM notes WHERE tenant_id = ?',
      args: [tenantId],
    });
  }

  /** No-op: HTTP client has no persistent connection to tear down. */
  close(): void { /* no-op */ }

  /**
   * Full export of notes + links for additive merge into another store (e.g. local SQLite snapshot).
   */
  async exportAllNotesAndLinks(): Promise<{
    notes: Array<{
      id: string;
      title: string;
      body: string;
      tags: string;
      tenant_id: string;
      created_at: string;
      updated_at: string;
      ref: number | null;
      hide_header: number;
    }>;
    links: Array<{ source_id: string; target_id: string }>;
  }> {
    const notesR = await this.client.execute({
      sql: 'SELECT id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header FROM notes',
      args: [],
    });
    const linksR = await this.client.execute({
      sql: 'SELECT source_id, target_id FROM note_links',
      args: [],
    });
    const notes = notesR.rows.map(row => ({
      id: row['id'] as string,
      title: row['title'] as string,
      body: row['body'] as string,
      tags: row['tags'] as string,
      tenant_id: row['tenant_id'] as string,
      created_at: row['created_at'] as string,
      updated_at: row['updated_at'] as string,
      ref: (row['ref'] as number | null | undefined) ?? null,
      hide_header: Number(row['hide_header'] ?? 0) ? 1 : 0,
    }));
    const links = linksR.rows.map(row => ({
      source_id: row['source_id'] as string,
      target_id: row['target_id'] as string,
    }));
    return { notes, links };
  }

  /**
   * Bulk-upsert notes from another store (e.g. local SQLite) into Turso.
   * Uses "last-write-wins by updated_at" — existing Turso notes are only
   * overwritten if the incoming version is newer.
   * Links are inserted with INSERT OR IGNORE (additive, never deleted).
   */
  async importNotes(
    notes: Array<{
      id: string;
      title: string;
      body: string;
      tags: string;
      tenant_id: string;
      created_at: string;
      updated_at: string;
      ref: number | null;
      hide_header: number;
    }>,
    links: Array<{ source_id: string; target_id: string }>,
  ): Promise<{ synced: number; skipped: number }> {
    if (notes.length === 0) return { synced: 0, skipped: 0 };

    let synced = 0;
    const CHUNK = 50;

    // Upsert notes in chunks to stay within libSQL batch limits
    for (let i = 0; i < notes.length; i += CHUNK) {
      const chunk = notes.slice(i, i + CHUNK);
      const statements = chunk.map(n => ({
        sql: `INSERT INTO notes (id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title       = excluded.title,
                body        = excluded.body,
                tags        = excluded.tags,
                updated_at  = excluded.updated_at,
                ref         = COALESCE(excluded.ref, notes.ref),
                hide_header = excluded.hide_header
              WHERE excluded.updated_at > notes.updated_at`,
        args: [
          n.id,
          n.title,
          n.body,
          n.tags,
          n.tenant_id,
          n.created_at,
          n.updated_at,
          n.ref,
          n.hide_header ?? 0,
        ] as import('@libsql/client').InValue[],
      }));
      await this.client.batch(statements, 'write');
      synced += chunk.length;
    }

    // Additive link sync — never remove existing Turso links
    if (links.length > 0) {
      for (let i = 0; i < links.length; i += CHUNK) {
        const chunk = links.slice(i, i + CHUNK);
        const statements = chunk.map(l => ({
          sql: 'INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)',
          args: [l.source_id, l.target_id] as import('@libsql/client').InValue[],
        }));
        await this.client.batch(statements, 'write');
      }
    }

    if (this.vaultPath) {
      for (const incoming of notes) {
        const note = await this.read(incoming.id);
        if (note) this.writeMdFile(note);
      }
    }

    return { synced, skipped: 0 };
  }

  private rowToNote(id: string, row: Record<string, unknown>, links: string[]): Note {
    return {
      id,
      ref: row['ref'] as number,
      title: row['title'] as string,
      body: row['body'] as string,
      tags: parseStoredTags(row['tags']),
      created: row['created_at'] as string,
      modified: row['updated_at'] as string,
      tenantId: row['tenant_id'] as string,
      links,
      hideHeader: ((row['hide_header'] as number) ?? 0) === 1,
    };
  }

  private writeMdFile(note: Note): void {
    if (!this.vaultPath) return;
    fs.mkdirSync(this.vaultPath, { recursive: true });
    const filePath = path.join(this.vaultPath, `${note.id}.md`);
    fs.writeFileSync(filePath, serializeNoteMarkdown(note), 'utf-8');
  }
}

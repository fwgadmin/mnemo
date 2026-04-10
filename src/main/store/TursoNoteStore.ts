import { createClient, type Client } from '@libsql/client';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Note, NoteListItem, CreateNoteInput, UpdateNoteInput, SearchResult, INoteStore } from '../../shared/types';

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT 'Untitled',
    body        TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',
    tenant_id   TEXT NOT NULL DEFAULT 'default',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS note_links (
    source_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notes_tenant ON notes(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_id)`,
];

const FTS_STATEMENTS = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, body, tags, content='notes', content_rowid='rowid')`,
  `CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, body, tags) VALUES (new.rowid, new.title, new.body, new.tags);
  END`,
  `CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body, tags) VALUES ('delete', old.rowid, old.title, old.body, old.tags);
  END`,
  `CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body, tags) VALUES ('delete', old.rowid, old.title, old.body, old.tags);
    INSERT INTO notes_fts(rowid, title, body, tags) VALUES (new.rowid, new.title, new.body, new.tags);
  END`,
];

/** Cloud-backed async store using Turso (libSQL). */
export class TursoNoteStore implements INoteStore {
  private client: Client;
  private vaultPath: string | undefined;

  constructor(url: string, authToken: string, vaultPath?: string) {
    this.client = createClient({ url, authToken });
    this.vaultPath = vaultPath;
  }

  /** Run schema migrations — call once before using the store. */
  async initSchema(): Promise<void> {
    const all = [...SCHEMA_STATEMENTS, ...FTS_STATEMENTS];
    await this.client.batch(
      all.map(sql => ({ sql })),
      'write',
    );
    await this.migrateRefIfNeeded();
  }

  private async migrateRefIfNeeded(): Promise<void> {
    const info = await this.client.execute({ sql: 'PRAGMA table_info(notes)', args: [] });
    const hasRef = info.rows.some(r => r['name'] === 'ref');
    if (hasRef) return;

    await this.client.execute({ sql: 'ALTER TABLE notes ADD COLUMN ref INTEGER', args: [] });

    const tenants = await this.client.execute({
      sql: 'SELECT DISTINCT tenant_id FROM notes',
      args: [],
    });
    for (const row of tenants.rows) {
      const tenantId = row['tenant_id'] as string;
      const ids = await this.client.execute({
        sql: 'SELECT id FROM notes WHERE tenant_id = ? ORDER BY created_at ASC',
        args: [tenantId],
      });
      let r = 1;
      for (const ir of ids.rows) {
        await this.client.execute({
          sql: 'UPDATE notes SET ref = ? WHERE id = ?',
          args: [r++, ir['id'] as string],
        });
      }
    }

    await this.client.execute({
      sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_tenant_ref ON notes (tenant_id, ref)',
      args: [],
    });
  }

  async create(input: CreateNoteInput): Promise<Note> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const tenantId = input.tenantId ?? 'default';
    const tags = input.tags ?? [];

    const maxRow = await this.client.execute({
      sql: 'SELECT COALESCE(MAX(ref), 0) + 1 AS n FROM notes WHERE tenant_id = ?',
      args: [tenantId],
    });
    const nextRef = maxRow.rows[0]?.['n'] as number;

    await this.client.execute({
      sql: `INSERT INTO notes (id, title, body, tags, tenant_id, created_at, updated_at, ref)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, input.title, input.body, JSON.stringify(tags), tenantId, now, now, nextRef],
    });

    const note: Note = {
      id,
      ref: nextRef,
      title: input.title,
      body: input.body,
      tags,
      created: now,
      modified: now,
      tenantId,
      links: [],
    };

    this.writeMdFile(note);
    return note;
  }

  async read(id: string): Promise<Note | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM notes WHERE id = ?',
      args: [id],
    });
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToNote(id, row);
  }

  async readByRef(ref: number, tenantId: string = 'default'): Promise<Note | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM notes WHERE tenant_id = ? AND ref = ?',
      args: [tenantId, ref],
    });
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToNote(row['id'] as string, row);
  }

  async update(input: UpdateNoteInput): Promise<Note | null> {
    const existing = await this.read(input.id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const title = input.title ?? existing.title;
    const body = input.body ?? existing.body;
    const tags = input.tags ?? existing.tags;

    await this.client.execute({
      sql: `UPDATE notes SET title = ?, body = ?, tags = ?, updated_at = ? WHERE id = ?`,
      args: [title, body, JSON.stringify(tags), now, input.id],
    });

    const note: Note = { ...existing, ref: existing.ref, title, body, tags, modified: now };
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
      sql: `SELECT ref, id, title, body, tags, updated_at
            FROM notes WHERE tenant_id = ? ORDER BY updated_at DESC`,
      args: [tenantId],
    });
    return result.rows.map(row => ({
      ref: row['ref'] as number,
      id: row['id'] as string,
      title: row['title'] as string,
      tags: JSON.parse(row['tags'] as string),
      modified: row['updated_at'] as string,
      snippet: (row['body'] as string).substring(0, 120),
    }));
  }

  async search(query: string, tenantId: string = 'default'): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    try {
      const result = await this.client.execute({
        sql: `SELECT n.ref, n.id, n.title, n.body, notes_fts.rank
              FROM notes_fts
              JOIN notes n ON n.rowid = notes_fts.rowid
              WHERE notes_fts MATCH ?
                AND n.tenant_id = ?
              ORDER BY notes_fts.rank
              LIMIT 50`,
        args: [query, tenantId],
      });
      return result.rows.map(row => ({
        ref: row['ref'] as number,
        id: row['id'] as string,
        title: row['title'] as string,
        snippet: (row['body'] as string).substring(0, 120),
        rank: row['rank'] as number,
      }));
    } catch {
      // FTS5 unavailable — fall back to LIKE
      const like = `%${query}%`;
      const result = await this.client.execute({
        sql: `SELECT ref, id, title, body FROM notes
              WHERE (title LIKE ? OR body LIKE ?) AND tenant_id = ?
              LIMIT 50`,
        args: [like, like, tenantId],
      });
      return result.rows.map((row, i) => ({
        ref: row['ref'] as number,
        id: row['id'] as string,
        title: row['title'] as string,
        snippet: (row['body'] as string).substring(0, 120),
        rank: i,
      }));
    }
  }

  async getBacklinks(noteId: string): Promise<NoteListItem[]> {
    const result = await this.client.execute({
      sql: `SELECT n.ref, n.id, n.title, n.body, n.tags, n.updated_at
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
      tags: JSON.parse(row['tags'] as string),
      modified: row['updated_at'] as string,
      snippet: (row['body'] as string).substring(0, 120),
    }));
  }

  async updateLinks(sourceId: string, targetIds: string[]): Promise<void> {
    const statements = [
      { sql: 'DELETE FROM note_links WHERE source_id = ?', args: [sourceId] },
      ...targetIds.map(targetId => ({
        sql: 'INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)',
        args: [sourceId, targetId],
      })),
    ];
    await this.client.batch(statements, 'write');
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

  /** No-op: HTTP client has no persistent connection to tear down. */
  close(): void { /* no-op */ }

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
        sql: `INSERT INTO notes (id, title, body, tags, tenant_id, created_at, updated_at, ref)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title      = excluded.title,
                body       = excluded.body,
                tags       = excluded.tags,
                updated_at = excluded.updated_at,
                ref        = COALESCE(excluded.ref, notes.ref)
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

    return { synced, skipped: 0 };
  }

  private rowToNote(id: string, row: Record<string, unknown>): Note {
    const links: string[] = [];  // links loaded lazily by consumers if needed
    return {
      id,
      ref: row['ref'] as number,
      title: row['title'] as string,
      body: row['body'] as string,
      tags: JSON.parse(row['tags'] as string),
      created: row['created_at'] as string,
      modified: row['updated_at'] as string,
      tenantId: row['tenant_id'] as string,
      links,
    };
  }

  private writeMdFile(note: Note): void {
    if (!this.vaultPath) return;
    fs.mkdirSync(this.vaultPath, { recursive: true });
    const filePath = path.join(this.vaultPath, `${note.id}.md`);
    const content = [
      '---',
      `title: "${note.title.replace(/"/g, '\\"')}"`,
      `tags: [${note.tags.map(t => `"${t}"`).join(', ')}]`,
      `created: ${note.created}`,
      `modified: ${note.modified}`,
      '---',
      '',
      note.body,
    ].join('\n');
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

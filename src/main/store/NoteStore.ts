import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type {
  Note,
  NoteListItem,
  CreateNoteInput,
  UpdateNoteInput,
  SearchResult,
  INoteStore,
  VaultSnapshot,
  SyncResult,
  SyncNoteRow,
  NoteTombstoneRow,
} from '../../shared/types';
import {
  ftsMatchFromUserQuery,
  likeWordsFromUserQuery,
  snippetForSearchResult,
} from '../../shared/searchQuery';
import { parseStoredTags } from '../../shared/noteTags';
import { migrateLocalNoteDatabase } from './migrations';
import { serializeNoteMarkdown } from './noteMarkdown';

/** Local SQLite-backed store (offline, default). */
export class LocalNoteStore implements INoteStore {
  private db: Database.Database;
  private vaultPath: string;

  constructor(dbPath: string, vaultPath: string) {
    this.vaultPath = vaultPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(vaultPath, { recursive: true });

    this.db = new Database(dbPath);
    try {
      this.db.pragma('foreign_keys = ON');
      migrateLocalNoteDatabase(this.db, dbPath);
      this.db.pragma('journal_mode = WAL');
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  create(input: CreateNoteInput): Promise<Note> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const tenantId = input.tenantId ?? 'default';
    const tags = input.tags ?? [];
    const hideHeader = input.hideHeader ? 1 : 0;

    /** Single statement so MAX(ref)+1 and INSERT are atomic (same as Turso). */
    this.db
      .prepare(
        `INSERT INTO notes (id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header)
         VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(ref), 0) + 1 FROM notes AS n WHERE n.tenant_id = ?), ?)`,
      )
      .run(id, input.title, input.body, JSON.stringify(tags), tenantId, now, now, tenantId, hideHeader);

    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any;
    if (!row) return Promise.reject(new Error('NoteStore.create: inserted row not found'));
    const note = this.rowToNote(row);
    this.writeMdFile(note);
    return Promise.resolve(note);
  }

  read(id: string): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any;
    if (!row) return Promise.resolve(null);
    return Promise.resolve(this.rowToNote(row));
  }

  readByRef(ref: number, tenantId: string = 'default'): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE tenant_id = ? AND ref = ?').get(tenantId, ref) as any;
    if (!row) return Promise.resolve(null);
    return Promise.resolve(this.rowToNote(row));
  }

  async update(input: UpdateNoteInput): Promise<Note | null> {
    const existing = await this.read(input.id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const title = input.title ?? existing.title;
    const body = input.body ?? existing.body;
    const tags = input.tags ?? existing.tags;
    const hideHeader = input.hideHeader !== undefined ? input.hideHeader : existing.hideHeader;

    this.db.prepare(`
      UPDATE notes SET title = ?, body = ?, tags = ?, updated_at = ?, hide_header = ? WHERE id = ?
    `).run(title, body, JSON.stringify(tags), now, hideHeader ? 1 : 0, input.id);

    const note: Note = {
      ...existing,
      ref: existing.ref,
      title,
      body,
      tags,
      modified: now,
      hideHeader,
    };

    this.writeMdFile(note);
    return note;
  }

  delete(id: string): Promise<boolean> {
    const row = this.db.prepare('SELECT tenant_id FROM notes WHERE id = ?').get(id) as
      | { tenant_id: string }
      | undefined;
    if (!row) return Promise.resolve(false);
    const deletedAt = new Date().toISOString();
    const result = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO note_tombstones (id, tenant_id, deleted_at) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET tenant_id = excluded.tenant_id, deleted_at = excluded.deleted_at
        WHERE excluded.deleted_at > note_tombstones.deleted_at
      `).run(id, row.tenant_id, deletedAt);
      return this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    })();
    if (result.changes > 0) {
      const filePath = path.join(this.vaultPath, `${id}.md`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  list(tenantId: string = 'default'): Promise<NoteListItem[]> {
    const rows = this.db.prepare(
      'SELECT ref, id, title, body, tags, created_at, updated_at, hide_header FROM notes WHERE tenant_id = ? ORDER BY updated_at DESC'
    ).all(tenantId) as any[];

    return Promise.resolve(rows.map(row => ({
      ref: row.ref,
      id: row.id,
      title: row.title,
      tags: parseStoredTags(row.tags),
      created: row.created_at,
      modified: row.updated_at,
      snippet: row.body.substring(0, 120),
      hideHeader: (row.hide_header ?? 0) === 1,
    })));
  }

  listNotes(tenantId: string = 'default'): Promise<Note[]> {
    const rows = this.db
      .prepare('SELECT * FROM notes WHERE tenant_id = ? ORDER BY updated_at DESC')
      .all(tenantId) as any[];
    const links = this.db
      .prepare(`
        SELECT nl.source_id, nl.target_id
        FROM note_links nl
        JOIN notes n ON n.id = nl.source_id
        WHERE n.tenant_id = ?
      `)
      .all(tenantId) as Array<{ source_id: string; target_id: string }>;
    const bySource = new Map<string, string[]>();
    for (const link of links) {
      const targets = bySource.get(link.source_id) ?? [];
      targets.push(link.target_id);
      bySource.set(link.source_id, targets);
    }
    return Promise.resolve(rows.map(row => this.rowToNote(row, bySource.get(row.id) ?? [])));
  }

  search(query: string, tenantId: string = 'default'): Promise<SearchResult[]> {
    if (!query.trim()) return Promise.resolve([]);
    const fts = ftsMatchFromUserQuery(query);
    if (!fts) return Promise.resolve([]);

    const mapRow = (row: any, rank: number): SearchResult => ({
      ref: row.ref,
      id: row.id,
      title: row.title,
      tags: parseStoredTags(row.tags),
      created: row.created_at,
      modified: row.updated_at,
      snippet: snippetForSearchResult(row.title, row.body, query),
      rank,
      hideHeader: (row.hide_header ?? 0) === 1,
    });

    try {
      const rows = this.db.prepare(`
        SELECT n.ref, n.id, n.title, n.body, n.tags, n.created_at, n.updated_at,
               n.hide_header, notes_fts.rank
        FROM notes_fts
        JOIN notes n ON n.rowid = notes_fts.rowid
        WHERE notes_fts MATCH ?
          AND n.tenant_id = ?
        ORDER BY notes_fts.rank
        LIMIT 50
      `).all(fts, tenantId) as any[];
      return Promise.resolve(rows.map(row => mapRow(row, row.rank)));
    } catch {
      const words = likeWordsFromUserQuery(query);
      if (words.length === 0) return Promise.resolve([]);
      const conds = words
        .map(() => '(INSTR(LOWER(title), LOWER(?)) > 0 OR INSTR(LOWER(body), LOWER(?)) > 0)')
        .join(' AND ');
      const args: string[] = [tenantId];
      for (const w of words) {
        args.push(w, w);
      }
      const rows = this.db
        .prepare(
          `SELECT ref, id, title, body, tags, created_at, updated_at, hide_header FROM notes
           WHERE tenant_id = ? AND ${conds}
           LIMIT 50`,
        )
        .all(...args) as any[];
      return Promise.resolve(rows.map((row, i) => mapRow(row, i)));
    }
  }

  getBacklinks(noteId: string): Promise<NoteListItem[]> {
    const rows = this.db.prepare(`
      SELECT n.ref, n.id, n.title, n.body, n.tags, n.created_at, n.updated_at
      FROM note_links nl
      JOIN notes n ON n.id = nl.source_id
      WHERE nl.target_id = ?
      ORDER BY n.updated_at DESC
    `).all(noteId) as any[];

    return Promise.resolve(rows.map(row => ({
      ref: row.ref,
      id: row.id,
      title: row.title,
      tags: parseStoredTags(row.tags),
      created: row.created_at,
      modified: row.updated_at,
      snippet: row.body.substring(0, 120),
    })));
  }

  updateLinks(sourceId: string, targetIds: string[]): Promise<void> {
    return this.updateLinksBatch([{ sourceId, targetIds }]);
  }

  updateLinksBatch(updates: Array<{ sourceId: string; targetIds: string[] }>): Promise<void> {
    if (updates.length === 0) return Promise.resolve();
    const del = this.db.prepare('DELETE FROM note_links WHERE source_id = ?');
    const ins = this.db.prepare('INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)');

    const transaction = this.db.transaction(() => {
      for (const { sourceId, targetIds } of updates) {
        del.run(sourceId);
        for (const targetId of targetIds) {
          ins.run(sourceId, targetId);
        }
      }
    });
    transaction();
    return Promise.resolve();
  }

  /** Resolve a title to a note ID (for wikilink targets) */
  resolveTitle(title: string, tenantId: string = 'default'): Promise<string | null> {
    const row = this.db.prepare(
      'SELECT id FROM notes WHERE title = ? AND tenant_id = ? LIMIT 1'
    ).get(title, tenantId) as any;
    return Promise.resolve(row?.id ?? null);
  }

  getAllLinks(tenantId: string = 'default'): Promise<Array<{ source: string; target: string }>> {
    const rows = this.db.prepare(`
      SELECT nl.source_id as source, nl.target_id as target
      FROM note_links nl
      JOIN notes n ON n.id = nl.source_id
      WHERE n.tenant_id = ?
    `).all(tenantId) as any[];
    return Promise.resolve(rows as Array<{ source: string; target: string }>);
  }

  getVaultSnapshot(tenantId: string = 'default'): Promise<VaultSnapshot> {
    const row = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM notes WHERE tenant_id = ?) AS note_count,
        (SELECT MAX(updated_at) FROM notes WHERE tenant_id = ?) AS max_u,
        (SELECT COUNT(*) FROM note_links nl INNER JOIN notes n ON n.id = nl.source_id WHERE n.tenant_id = ?) AS link_count,
        (SELECT COALESCE(SUM(LENGTH(body) + LENGTH(title) + LENGTH(tags)), 0) FROM notes WHERE tenant_id = ?) AS content_bytes
    `).get(tenantId, tenantId, tenantId, tenantId) as {
      note_count: number;
      max_u: string | null;
      link_count: number;
      content_bytes: number;
    };
    return Promise.resolve({
      noteCount: row.note_count,
      maxUpdatedAt: row.max_u,
      linkCount: row.link_count,
      contentBytes: row.content_bytes,
      appKvMaxUpdatedAt: null,
    });
  }

  listDistinctTenantIds(): Promise<string[]> {
    const rows = this.db.prepare('SELECT DISTINCT tenant_id FROM notes').all() as { tenant_id: string }[];
    return Promise.resolve(rows.map(r => r.tenant_id));
  }

  getNoteCountsByTenant(): Promise<Record<string, number>> {
    const rows = this.db
      .prepare('SELECT tenant_id, COUNT(*) AS c FROM notes GROUP BY tenant_id')
      .all() as { tenant_id: string; c: number }[];
    const out: Record<string, number> = {};
    for (const row of rows) {
      out[row.tenant_id] = Number(row.c);
    }
    return Promise.resolve(out);
  }

  /**
   * Merge remote/libSQL rows into this SQLite file and mirror .md files for affected notes.
   * Last-write-wins across note updates and deletion tombstones. Links are replaced exactly for accepted source notes.
   */
  async importNotesFromRemote(
    notes: SyncNoteRow[],
    links: Array<{ source_id: string; target_id: string }>,
    tombstones: NoteTombstoneRow[] = [],
  ): Promise<SyncResult> {
    if (notes.length === 0 && links.length === 0 && tombstones.length === 0) {
      return { synced: 0, skipped: 0 };
    }

    const upsert = this.db.prepare(`
      INSERT INTO notes (id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title       = excluded.title,
        body        = excluded.body,
        tags        = excluded.tags,
        updated_at  = excluded.updated_at,
        ref         = COALESCE(excluded.ref, notes.ref),
        hide_header = excluded.hide_header
      WHERE excluded.updated_at > notes.updated_at
    `);

    let applied = 0;
    let skipped = 0;
    const acceptedSources = new Set<string>();
    const deletedIds = new Set<string>();
    const getNoteVersion = this.db.prepare('SELECT updated_at FROM notes WHERE id = ?');
    const getTombstoneVersion = this.db.prepare('SELECT deleted_at FROM note_tombstones WHERE id = ?');
    const upsertTombstone = this.db.prepare(`
      INSERT INTO note_tombstones (id, tenant_id, deleted_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET tenant_id = excluded.tenant_id, deleted_at = excluded.deleted_at
      WHERE excluded.deleted_at > note_tombstones.deleted_at
    `);
    const deleteNote = this.db.prepare('DELETE FROM notes WHERE id = ?');
    const deleteTombstone = this.db.prepare('DELETE FROM note_tombstones WHERE id = ? AND deleted_at < ?');
    const deleteLinks = this.db.prepare('DELETE FROM note_links WHERE source_id = ?');
    const insertLink = this.db.prepare(
      'INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)',
    );

    this.db.transaction(() => {
      for (const tombstone of tombstones) {
        const note = getNoteVersion.get(tombstone.id) as { updated_at: string } | undefined;
        if (note && note.updated_at > tombstone.deleted_at) {
          skipped += 1;
          continue;
        }
        const info = upsertTombstone.run(tombstone.id, tombstone.tenant_id, tombstone.deleted_at);
        if (info.changes > 0) applied += 1;
        else skipped += 1;
        if (!note || tombstone.deleted_at < note.updated_at) continue;
        deleteNote.run(tombstone.id);
        deletedIds.add(tombstone.id);
      }

      for (const n of notes) {
        const tombstone = getTombstoneVersion.get(n.id) as { deleted_at: string } | undefined;
        if (tombstone && tombstone.deleted_at >= n.updated_at) {
          skipped += 1;
          continue;
        }
        const existing = getNoteVersion.get(n.id) as { updated_at: string } | undefined;
        if (existing && existing.updated_at > n.updated_at) {
          skipped += 1;
          continue;
        }
        acceptedSources.add(n.id);
        deleteTombstone.run(n.id, n.updated_at);
        const info = upsert.run(
          n.id,
          n.title,
          n.body,
          n.tags,
          n.tenant_id,
          n.created_at,
          n.updated_at,
          n.ref,
          n.hide_header ?? 0,
        );
        if (info.changes > 0) applied += 1;
        else skipped += 1;
      }

      for (const sourceId of acceptedSources) deleteLinks.run(sourceId);
      const existingIds = new Set(
        (this.db.prepare('SELECT id FROM notes').all() as { id: string }[]).map(row => row.id),
      );
      for (const link of links) {
        if (acceptedSources.has(link.source_id) && existingIds.has(link.target_id)) {
          insertLink.run(link.source_id, link.target_id);
        }
      }
    })();

    for (const id of deletedIds) {
      try {
        fs.unlinkSync(path.join(this.vaultPath, `${id}.md`));
      } catch {
        /* missing */
      }
    }

    for (const n of notes) {
      const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(n.id) as any;
      if (!row) continue;
      const note = this.rowToNote(row);
      this.writeMdFile(note);
    }

    return { synced: applied, skipped };
  }

  async purgeTenantNotes(tenantId: string): Promise<void> {
    const ids = this.db.prepare('SELECT id FROM notes WHERE tenant_id = ?').all(tenantId) as { id: string }[];
    for (const { id } of ids) {
      try {
        fs.unlinkSync(path.join(this.vaultPath, `${id}.md`));
      } catch {
        /* missing */
      }
    }
    this.db.prepare('DELETE FROM notes WHERE tenant_id = ?').run(tenantId);
    this.db.prepare('DELETE FROM note_tombstones WHERE tenant_id = ?').run(tenantId);
  }

  close(): void {
    this.db.close();
  }

  // --- Private helpers ---

  private rowToNote(row: any, links?: string[]): Note {
    return {
      id: row.id,
      ref: row.ref as number,
      title: row.title,
      body: row.body,
      tags: parseStoredTags(row.tags),
      created: row.created_at,
      modified: row.updated_at,
      tenantId: row.tenant_id,
      links: links ?? this.getLinksForNote(row.id),
      hideHeader: (row.hide_header ?? 0) === 1,
    };
  }

  private getLinksForNote(noteId: string): string[] {
    const rows = this.db.prepare(
      'SELECT target_id FROM note_links WHERE source_id = ?'
    ).all(noteId) as any[];
    return rows.map(r => r.target_id);
  }

  private writeMdFile(note: Note): void {
    const filePath = path.join(this.vaultPath, `${note.id}.md`);
    fs.writeFileSync(filePath, serializeNoteMarkdown(note), 'utf-8');
  }
}

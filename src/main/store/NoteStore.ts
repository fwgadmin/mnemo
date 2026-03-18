import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Note, NoteListItem, CreateNoteInput, UpdateNoteInput, SearchResult, INoteStore } from '../../shared/types';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  body        TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_links (
  source_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  PRIMARY KEY (source_id, target_id)
);

CREATE TABLE IF NOT EXISTS embeddings (
  note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  model       TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  vector      BLOB NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (note_id, model)
);

CREATE INDEX IF NOT EXISTS idx_notes_tenant ON notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_id);
`;

const FTS_SQL = [
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

/** Local SQLite-backed store (offline, default). */
export class LocalNoteStore implements INoteStore {
  private db: Database.Database;
  private vaultPath: string;

  constructor(dbPath: string, vaultPath: string) {
    this.vaultPath = vaultPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(vaultPath, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(SCHEMA_SQL);
    for (const stmt of FTS_SQL) {
      this.db.exec(stmt);
    }
  }

  create(input: CreateNoteInput): Promise<Note> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const tenantId = input.tenantId ?? 'default';
    const tags = input.tags ?? [];

    const stmt = this.db.prepare(`
      INSERT INTO notes (id, title, body, tags, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, input.title, input.body, JSON.stringify(tags), tenantId, now, now);

    const note: Note = {
      id,
      title: input.title,
      body: input.body,
      tags,
      created: now,
      modified: now,
      tenantId,
      links: [],
    };

    this.writeMdFile(note);
    return Promise.resolve(note);
  }

  read(id: string): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any;
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

    this.db.prepare(`
      UPDATE notes SET title = ?, body = ?, tags = ?, updated_at = ? WHERE id = ?
    `).run(title, body, JSON.stringify(tags), now, input.id);

    const note: Note = {
      ...existing,
      title,
      body,
      tags,
      modified: now,
    };

    this.writeMdFile(note);
    return note;
  }

  delete(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
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
      'SELECT id, title, body, tags, updated_at FROM notes WHERE tenant_id = ? ORDER BY updated_at DESC'
    ).all(tenantId) as any[];

    return Promise.resolve(rows.map(row => ({
      id: row.id,
      title: row.title,
      tags: JSON.parse(row.tags),
      modified: row.updated_at,
      snippet: row.body.substring(0, 120),
    })));
  }

  search(query: string, tenantId: string = 'default'): Promise<SearchResult[]> {
    if (!query.trim()) return Promise.resolve([]);

    const rows = this.db.prepare(`
      SELECT n.id, n.title, n.body, notes_fts.rank
      FROM notes_fts
      JOIN notes n ON n.rowid = notes_fts.rowid
      WHERE notes_fts MATCH ?
        AND n.tenant_id = ?
      ORDER BY notes_fts.rank
      LIMIT 50
    `).all(query, tenantId) as any[];

    return Promise.resolve(rows.map(row => ({
      id: row.id,
      title: row.title,
      snippet: row.body.substring(0, 120),
      rank: row.rank,
    })));
  }

  getBacklinks(noteId: string): Promise<NoteListItem[]> {
    const rows = this.db.prepare(`
      SELECT n.id, n.title, n.body, n.tags, n.updated_at
      FROM note_links nl
      JOIN notes n ON n.id = nl.source_id
      WHERE nl.target_id = ?
      ORDER BY n.updated_at DESC
    `).all(noteId) as any[];

    return Promise.resolve(rows.map(row => ({
      id: row.id,
      title: row.title,
      tags: JSON.parse(row.tags),
      modified: row.updated_at,
      snippet: row.body.substring(0, 120),
    })));
  }

  updateLinks(sourceId: string, targetIds: string[]): Promise<void> {
    const del = this.db.prepare('DELETE FROM note_links WHERE source_id = ?');
    const ins = this.db.prepare('INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)');

    const transaction = this.db.transaction(() => {
      del.run(sourceId);
      for (const targetId of targetIds) {
        ins.run(sourceId, targetId);
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

  close(): void {
    this.db.close();
  }

  // --- Private helpers ---

  private rowToNote(row: any): Note {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      tags: JSON.parse(row.tags),
      created: row.created_at,
      modified: row.updated_at,
      tenantId: row.tenant_id,
      links: this.getLinksForNote(row.id),
    };
  }

  private getLinksForNote(noteId: string): string[] {
    const rows = this.db.prepare(
      'SELECT target_id FROM note_links WHERE source_id = ?'
    ).all(noteId) as any[];
    return rows.map(r => r.target_id);
  }

  private writeMdFile(note: Note): void {
    const frontmatter = [
      '---',
      `id: "${note.id}"`,
      `title: "${note.title.replace(/"/g, '\\"')}"`,
      `tags: [${note.tags.map(t => `"${t}"`).join(', ')}]`,
      `created: "${note.created}"`,
      `modified: "${note.modified}"`,
      `tenantId: "${note.tenantId}"`,
      '---',
    ].join('\n');

    const content = `${frontmatter}\n\n${note.body}`;
    const filePath = path.join(this.vaultPath, `${note.id}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

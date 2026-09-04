import type Database from 'better-sqlite3';
import type { Client, InValue } from '@libsql/client';
import * as fs from 'fs';
import * as path from 'path';

export const CURRENT_NOTE_SCHEMA_VERSION = 3;

export interface NoteStoreMigration {
  version: number;
  name: string;
}

/** Ordered migration ledger shared by local SQLite and remote libSQL. */
export const NOTE_STORE_MIGRATIONS: readonly NoteStoreMigration[] = [
  { version: 1, name: 'core-schema' },
  { version: 2, name: 'note-refs' },
  { version: 3, name: 'hidden-note-headers' },
];

export const CORE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT 'Untitled',
    body        TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',
    tenant_id   TEXT NOT NULL DEFAULT 'default',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    ref         INTEGER,
    hide_header INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS note_links (
    source_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id)
  )`,
  `CREATE TABLE IF NOT EXISTS embeddings (
    note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    model       TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    vector      BLOB NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (note_id, model)
  )`,
  `CREATE TABLE IF NOT EXISTS app_kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_notes_tenant ON notes(tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_id)',
  `CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title, body, tags, content='notes', content_rowid='rowid'
  )`,
  `CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, body, tags)
    VALUES (new.rowid, new.title, new.body, new.tags);
  END`,
  `CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
    VALUES ('delete', old.rowid, old.title, old.body, old.tags);
  END`,
  `CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
    VALUES ('delete', old.rowid, old.title, old.body, old.tags);
    INSERT INTO notes_fts(rowid, title, body, tags)
    VALUES (new.rowid, new.title, new.body, new.tags);
  END`,
  `INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')`,
] as const;

const CREATE_MIGRATION_TABLE_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
)`;

const BACKFILL_REFS_SQL = `
  WITH missing AS (
    SELECT id, tenant_id,
           ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC) AS seq
    FROM notes
    WHERE ref IS NULL
  ), maxima AS (
    SELECT tenant_id, COALESCE(MAX(ref), 0) AS max_ref
    FROM notes
    GROUP BY tenant_id
  )
  UPDATE notes
  SET ref = (
    SELECT maxima.max_ref + missing.seq
    FROM missing
    JOIN maxima ON maxima.tenant_id = missing.tenant_id
    WHERE missing.id = notes.id
  )
  WHERE ref IS NULL
`;

function localTableExists(db: Database.Database, tableName: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName),
  );
}

function localColumns(db: Database.Database, tableName: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map(row => row.name),
  );
}

function localSchemaVersion(db: Database.Database): number {
  if (!localTableExists(db, 'schema_migrations')) return 0;
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as {
    version: number;
  };
  return Number(row.version);
}

function hasExistingApplicationSchema(db: Database.Database): boolean {
  const row = db.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'
    LIMIT 1
  `).get();
  return Boolean(row);
}

/** Create at most one consistent backup for each source schema version. */
export function backupLocalDatabaseForMigration(
  db: Database.Database,
  dbPath: string,
  sourceVersion: number,
): string | null {
  if (!hasExistingApplicationSchema(db)) return null;

  const directory = path.dirname(dbPath);
  const basename = path.basename(dbPath);
  const prefix = `${basename}.backup-v${sourceVersion}-`;
  const existing = fs.readdirSync(directory).find(name => name.startsWith(prefix));
  if (existing) return path.join(directory, existing);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(directory, `${prefix}${stamp}`);
  db.prepare('VACUUM INTO ?').run(backupPath);
  return backupPath;
}

function applyLocalMigration(db: Database.Database, migration: NoteStoreMigration): void {
  const appliedAt = new Date().toISOString();
  db.transaction(() => {
    if (migration.version === 1) {
      for (const sql of CORE_SCHEMA_STATEMENTS) db.exec(sql);
    } else if (migration.version === 2) {
      const columns = localColumns(db, 'notes');
      if (!columns.has('ref')) db.exec('ALTER TABLE notes ADD COLUMN ref INTEGER');
      db.exec(BACKFILL_REFS_SQL);
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_tenant_ref ON notes(tenant_id, ref)');
    } else if (migration.version === 3) {
      const columns = localColumns(db, 'notes');
      if (!columns.has('hide_header')) {
        db.exec('ALTER TABLE notes ADD COLUMN hide_header INTEGER NOT NULL DEFAULT 0');
      }
    }
    db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(migration.version, appliedAt);
  })();
}

export function migrateLocalNoteDatabase(db: Database.Database, dbPath: string): void {
  const sourceVersion = localSchemaVersion(db);
  if (sourceVersion < CURRENT_NOTE_SCHEMA_VERSION) {
    backupLocalDatabaseForMigration(db, dbPath, sourceVersion);
  }

  db.exec(CREATE_MIGRATION_TABLE_SQL);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
      row => Number(row.version),
    ),
  );
  for (const migration of NOTE_STORE_MIGRATIONS) {
    if (!applied.has(migration.version)) applyLocalMigration(db, migration);
  }
}

async function remoteColumns(client: Client, tableName: string): Promise<Set<string>> {
  const result = await client.execute({ sql: `PRAGMA table_info(${tableName})`, args: [] });
  return new Set(result.rows.map(row => row['name'] as string));
}

async function applyRemoteMigration(client: Client, migration: NoteStoreMigration): Promise<void> {
  const statements: Array<{ sql: string; args?: InValue[] }> = [];
  if (migration.version === 1) {
    statements.push(...CORE_SCHEMA_STATEMENTS.map(sql => ({ sql })));
  } else if (migration.version === 2) {
    const columns = await remoteColumns(client, 'notes');
    if (!columns.has('ref')) statements.push({ sql: 'ALTER TABLE notes ADD COLUMN ref INTEGER' });
    statements.push(
      { sql: BACKFILL_REFS_SQL },
      { sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_tenant_ref ON notes(tenant_id, ref)' },
    );
  } else if (migration.version === 3) {
    const columns = await remoteColumns(client, 'notes');
    if (!columns.has('hide_header')) {
      statements.push({ sql: 'ALTER TABLE notes ADD COLUMN hide_header INTEGER NOT NULL DEFAULT 0' });
    }
  }
  statements.push({
    sql: 'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    args: [migration.version, new Date().toISOString()],
  });
  await client.batch(statements, 'write');
}

export async function migrateRemoteNoteDatabase(client: Client): Promise<void> {
  await client.execute({ sql: CREATE_MIGRATION_TABLE_SQL, args: [] });
  const result = await client.execute({ sql: 'SELECT version FROM schema_migrations', args: [] });
  const applied = new Set(result.rows.map(row => Number(row['version'])));
  for (const migration of NOTE_STORE_MIGRATIONS) {
    if (!applied.has(migration.version)) await applyRemoteMigration(client, migration);
  }
}

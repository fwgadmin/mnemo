import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalNoteStore } from './NoteStore';
import { TursoNoteStore } from './TursoNoteStore';
import { NOTE_STORE_MIGRATIONS } from './migrations';

const cleanupDirectories: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirectories.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function temporaryRoot(label: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mnemo-${label}-`));
  cleanupDirectories.push(root);
  return root;
}

function migrationVersions(dbPath: string): Array<{ version: number; applied_at: string }> {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version').all() as Array<{
      version: number;
      applied_at: string;
    }>;
  } finally {
    db.close();
  }
}

function backupPaths(root: string, dbName = 'mnemo.db'): string[] {
  return fs.readdirSync(root)
    .filter(name => name.startsWith(`${dbName}.backup-v`))
    .map(name => path.join(root, name));
}

describe('note-store migrations', () => {
  it('creates the current schema and is unchanged on a second local run', () => {
    const root = temporaryRoot('fresh-migration');
    const dbPath = path.join(root, 'mnemo.db');

    new LocalNoteStore(dbPath, path.join(root, 'vault')).close();
    const first = migrationVersions(dbPath);
    new LocalNoteStore(dbPath, path.join(root, 'vault')).close();

    expect(first.map(row => row.version)).toEqual(NOTE_STORE_MIGRATIONS.map(migration => migration.version));
    expect(migrationVersions(dbPath)).toEqual(first);
    expect(backupPaths(root)).toEqual([]);
  });

  it('backs up and upgrades a legacy database without losing notes or links', async () => {
    const root = temporaryRoot('legacy-migration');
    const dbPath = path.join(root, 'mnemo.db');
    const legacy = new Database(dbPath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE notes (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, tags TEXT NOT NULL,
        tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE note_links (
        source_id TEXT NOT NULL REFERENCES notes(id),
        target_id TEXT NOT NULL REFERENCES notes(id),
        PRIMARY KEY (source_id, target_id)
      );
      INSERT INTO notes VALUES
        ('old-a', 'Old A', 'legacy searchable', '["Legacy"]', 'default', '2024-01-01', '2024-01-01'),
        ('old-b', 'Old B', 'links', '[]', 'default', '2024-01-02', '2024-01-02');
      INSERT INTO note_links VALUES ('old-b', 'old-a');
    `);
    legacy.close();

    const store = new LocalNoteStore(dbPath, path.join(root, 'vault'));
    expect((await store.read('old-a'))).toMatchObject({ ref: 1, hideHeader: false, tags: ['Legacy'] });
    expect(await store.getAllLinks()).toEqual([{ source: 'old-b', target: 'old-a' }]);
    expect((await store.search('searchable'))[0]?.id).toBe('old-a');
    store.close();

    const backups = backupPaths(root);
    expect(backups).toHaveLength(1);
    const backup = new Database(backups[0], { readonly: true });
    expect(backup.prepare('SELECT title FROM notes WHERE id = ?').get('old-a')).toEqual({ title: 'Old A' });
    expect((backup.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>).map(c => c.name))
      .not.toContain('ref');
    backup.close();

    const applied = migrationVersions(dbPath);
    new LocalNoteStore(dbPath, path.join(root, 'vault')).close();
    expect(migrationVersions(dbPath)).toEqual(applied);
    expect(backupPaths(root)).toEqual(backups);
  });

  it('preserves deployed refs and hidden-header values when adding the ledger', async () => {
    const root = temporaryRoot('unversioned-migration');
    const dbPath = path.join(root, 'mnemo.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE notes (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, tags TEXT NOT NULL,
        tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        ref INTEGER, hide_header INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO notes VALUES ('kept', 'Kept', '', '[]', 'default', '2025-01-01', '2025-01-01', 17, 1);
    `);
    db.close();

    const store = new LocalNoteStore(dbPath, path.join(root, 'vault'));
    expect(await store.read('kept')).toMatchObject({ ref: 17, hideHeader: true });
    store.close();
  });

  it('leaves a readable pre-migration backup when an upgrade fails', () => {
    const root = temporaryRoot('failed-migration');
    const dbPath = path.join(root, 'mnemo.db');
    const broken = new Database(dbPath);
    broken.exec(`
      CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL);
      INSERT INTO notes VALUES ('recover-me', 'Recover me');
    `);
    broken.close();

    expect(() => new LocalNoteStore(dbPath, path.join(root, 'vault'))).toThrow();
    const backups = backupPaths(root);
    expect(backups).toHaveLength(1);
    const backup = new Database(backups[0], { readonly: true });
    expect(backup.prepare('SELECT * FROM notes').get()).toEqual({ id: 'recover-me', title: 'Recover me' });
    backup.close();
  });

  it('upgrades legacy libSQL idempotently', async () => {
    const root = temporaryRoot('remote-migration');
    const url = `file:${path.join(root, 'remote.db')}`;
    const client = createClient({ url });
    await client.batch([
      { sql: `CREATE TABLE notes (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, tags TEXT NOT NULL,
          tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )` },
      { sql: `INSERT INTO notes VALUES ('remote-old', 'Remote old', '', '[]', 'default', '2024-01-01', '2024-01-01')` },
    ], 'write');

    const store = new TursoNoteStore(url, '');
    await store.initSchema();
    expect(await store.read('remote-old')).toMatchObject({ ref: 1, hideHeader: false });
    await client.execute(`WITH RECURSIVE seq(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM seq WHERE x < 500
    )
    INSERT INTO notes (id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header)
    SELECT 'plan-' || x, 'Plan ' || x, '', '[]',
           CASE WHEN x % 2 = 0 THEN 'default' ELSE 'other' END,
           printf('2025-01-%02d', (x % 28) + 1), printf('2025-02-%02d', (x % 28) + 1), x + 1, 0
    FROM seq`);
    await client.execute('ANALYZE');
    const plan = await client.execute({
      sql: 'EXPLAIN QUERY PLAN SELECT id FROM notes WHERE tenant_id = ? ORDER BY updated_at DESC',
      args: ['default'],
    });
    expect(plan.rows.map(row => String(row['detail'])).join('\n')).toContain('idx_notes_tenant_updated');
    const first = await client.execute('SELECT version, applied_at FROM schema_migrations ORDER BY version');
    await store.initSchema();
    const second = await client.execute('SELECT version, applied_at FROM schema_migrations ORDER BY version');
    expect(second.rows).toEqual(first.rows);
    client.close();
  });

  it('writes byte-equivalent local and Turso Markdown for the same note', async () => {
    const root = temporaryRoot('markdown-parity');
    const localVault = path.join(root, 'local-vault');
    const remoteVault = path.join(root, 'remote-vault');
    const local = new LocalNoteStore(path.join(root, 'local.db'), localVault);
    const remote = new TursoNoteStore(`file:${path.join(root, 'remote.db')}`, '', remoteVault);
    await remote.initSchema();
    const row = {
      id: 'same-note',
      title: 'Same "note"',
      body: '# Identical\n\nBody',
      tags: '["Work","Parity"]',
      tenant_id: 'team-a',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      ref: 12,
      hide_header: 1,
    };

    await local.importNotesFromRemote([row], []);
    await remote.importNotes([row], []);

    expect(fs.readFileSync(path.join(localVault, 'same-note.md'), 'utf8')).toBe(
      fs.readFileSync(path.join(remoteVault, 'same-note.md'), 'utf8'),
    );
    local.close();
    remote.close();
  });
});

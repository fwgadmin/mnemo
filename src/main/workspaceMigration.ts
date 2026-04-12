/**
 * One-time merge of legacy per-workspace SQLite files (workspaces/<id>/mnemo.db) into a single
 * bootstrap mnemo.db with tenant_id = workspace folder id.
 */
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { LocalNoteStore } from './store/NoteStore';

function quoteDbPath(p: string): string {
  return path.resolve(p).replace(/'/g, "''");
}

/**
 * If `bootstrapRoot/mnemo.db` is missing but nested workspace DBs exist, merge them and move
 * old dirs under workspaces/_migrated/<stamp>/.
 */
export function runLegacyWorkspaceMigration(bootstrapRoot: string): void {
  const rootDb = path.join(bootstrapRoot, 'mnemo.db');
  if (fs.existsSync(rootDb)) {
    return;
  }

  const wsRoot = path.join(bootstrapRoot, 'workspaces');
  if (!fs.existsSync(wsRoot)) {
    return;
  }

  const candidates: { id: string; dbPath: string }[] = [];
  for (const name of fs.readdirSync(wsRoot, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    if (name.name.startsWith('_')) continue;
    const p = path.join(wsRoot, name.name, 'mnemo.db');
    if (fs.existsSync(p)) {
      candidates.push({ id: name.name, dbPath: p });
    }
  }
  if (candidates.length === 0) {
    return;
  }

  const vaultPath = path.join(bootstrapRoot, 'vault');
  fs.mkdirSync(vaultPath, { recursive: true });

  const temp = new LocalNoteStore(rootDb, vaultPath);
  temp.close();

  const db = new Database(rootDb);
  try {
    db.pragma('foreign_keys = OFF');
    for (const { id, dbPath } of candidates) {
      const ap = quoteDbPath(dbPath);
      db.exec(`ATTACH DATABASE '${ap}' AS src`);
      try {
        db.prepare(
          `INSERT OR IGNORE INTO main.notes (id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header)
           SELECT id, title, body, tags, ?, created_at, updated_at, ref, hide_header FROM src.notes`,
        ).run(id);
        db.prepare(
          `INSERT OR IGNORE INTO main.note_links SELECT source_id, target_id FROM src.note_links`,
        ).run();
        try {
          db.prepare(
            `INSERT OR IGNORE INTO main.embeddings SELECT * FROM src.embeddings`,
          ).run();
        } catch {
          /* optional table */
        }
      } finally {
        db.exec('DETACH DATABASE src');
      }
    }
    db.pragma('foreign_keys = ON');
  } finally {
    db.close();
  }

  for (const { id } of candidates) {
    const srcV = path.join(wsRoot, id, 'vault');
    if (!fs.existsSync(srcV)) continue;
    for (const f of fs.readdirSync(srcV)) {
      if (!f.endsWith('.md')) continue;
      const dst = path.join(vaultPath, f);
      if (!fs.existsSync(dst)) {
        try {
          fs.copyFileSync(path.join(srcV, f), dst);
        } catch {
          /* ignore */
        }
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destParent = path.join(wsRoot, '_migrated', stamp);
  fs.mkdirSync(destParent, { recursive: true });
  for (const { id } of candidates) {
    const srcDir = path.join(wsRoot, id);
    if (fs.existsSync(srcDir)) {
      try {
        fs.renameSync(srcDir, path.join(destParent, id));
      } catch {
        /* ignore */
      }
    }
  }
}

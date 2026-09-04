import * as fs from 'fs';
import Database from 'better-sqlite3';
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import { migrateLocalNoteDatabase } from './store/migrations';
import type { NoteTombstoneRow, SyncNoteRow, SyncResult } from '../shared/types';

export type BulkNoteRow = SyncNoteRow;

/** Read all notes + links from a local SQLite file (same shape as Settings → sync local). */
export function readLocalNotesAndLinksForSync(dbPath: string): {
  notes: BulkNoteRow[];
  links: Array<{ source_id: string; target_id: string }>;
  tombstones: NoteTombstoneRow[];
} {
  if (!fs.existsSync(dbPath)) {
    return { notes: [], links: [], tombstones: [] };
  }
  const db = new Database(dbPath);
  try {
    migrateLocalNoteDatabase(db, dbPath);
    const notes = db
      .prepare(
        'SELECT id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header FROM notes',
      )
      .all() as BulkNoteRow[];
    const links = db
      .prepare('SELECT source_id, target_id FROM note_links')
      .all() as Array<{ source_id: string; target_id: string }>;
    const tombstones = db
      .prepare('SELECT id, tenant_id, deleted_at FROM note_tombstones')
      .all() as NoteTombstoneRow[];
    return { notes, links, tombstones };
  } finally {
    db.close();
  }
}

/**
 * Upload local note/deletion events and exact outgoing links into Turso.
 */
export async function pushLocalToTursoStore(
  turso: TursoNoteStore,
  localDbPath: string,
): Promise<SyncResult> {
  const { notes, links, tombstones } = readLocalNotesAndLinksForSync(localDbPath);
  return turso.importNotes(notes, links, tombstones);
}

/**
 * Merge the remote snapshot into local SQLite and its vault mirror, including deletions and link removals.
 */
export async function pullTursoIntoLocalStore(
  turso: TursoNoteStore,
  localDbPath: string,
  localVaultPath: string,
): Promise<SyncResult> {
  const payload = await turso.exportAllNotesAndLinks();
  const local = new LocalNoteStore(localDbPath, localVaultPath);
  try {
    return await local.importNotesFromRemote(payload.notes, payload.links, payload.tombstones);
  } finally {
    local.close();
  }
}

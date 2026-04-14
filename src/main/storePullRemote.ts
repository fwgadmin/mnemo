import * as fs from 'fs';
import Database from 'better-sqlite3';
import { LocalNoteStore, migrateNoteDatabaseHideHeader, migrateNoteDatabaseRef } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import type { SyncResult } from '../shared/types';

export type BulkNoteRow = {
  id: string;
  title: string;
  body: string;
  tags: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  ref: number | null;
  hide_header: number;
};

/** Read all notes + links from a local SQLite file (same shape as Settings → sync local). */
export function readLocalNotesAndLinksForSync(dbPath: string): {
  notes: BulkNoteRow[];
  links: Array<{ source_id: string; target_id: string }>;
} {
  if (!fs.existsSync(dbPath)) {
    return { notes: [], links: [] };
  }
  const db = new Database(dbPath);
  try {
    migrateNoteDatabaseRef(db);
    migrateNoteDatabaseHideHeader(db);
    const notes = db
      .prepare(
        'SELECT id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header FROM notes',
      )
      .all() as BulkNoteRow[];
    const links = db
      .prepare('SELECT source_id, target_id FROM note_links')
      .all() as Array<{ source_id: string; target_id: string }>;
    return { notes, links };
  } finally {
    db.close();
  }
}

/**
 * Additive upload: merge local SQLite rows into Turso (same as Settings → sync local). Does not delete remote rows.
 */
export async function pushLocalToTursoStore(
  turso: TursoNoteStore,
  localDbPath: string,
): Promise<SyncResult> {
  const { notes, links } = readLocalNotesAndLinksForSync(localDbPath);
  return turso.importNotes(notes, links);
}

/**
 * Additive snapshot: merge all rows from Turso into a local SQLite file + vault .md files.
 * Does not delete local notes or links absent from the remote payload.
 */
export async function pullTursoIntoLocalStore(
  turso: TursoNoteStore,
  localDbPath: string,
  localVaultPath: string,
): Promise<SyncResult> {
  const payload = await turso.exportAllNotesAndLinks();
  const local = new LocalNoteStore(localDbPath, localVaultPath);
  try {
    return await local.importNotesAdditiveFromRemote(payload.notes, payload.links);
  } finally {
    local.close();
  }
}

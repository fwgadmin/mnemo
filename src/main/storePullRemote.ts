import * as fs from 'fs';
import Database from 'better-sqlite3';
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import { migrateLocalNoteDatabase } from './store/migrations';
import type { INoteStore, NoteTombstoneRow, SyncNoteRow, SyncResult } from '../shared/types';

export interface AttachmentSyncResult {
  copied: number;
  failed: number;
}

/**
 * Copy attachments present in `from` but missing in `to`. Attachments are immutable and content-addressed,
 * so this is a conflict-free set union; bytes are re-verified against the hash on both read and write.
 */
export async function copyMissingAttachments(from: INoteStore, to: INoteStore): Promise<AttachmentSyncResult> {
  const [source, target] = await Promise.all([from.listAttachmentRows(), to.listAttachmentRows()]);
  const present = new Set(target.map(row => `${row.tenant_id}\u0000${row.hash}`));
  let copied = 0;
  let failed = 0;
  for (const row of source) {
    if (present.has(`${row.tenant_id}\u0000${row.hash}`)) continue;
    const stored = await from.getAttachment(row.hash, row.tenant_id);
    if (stored && (await to.importAttachment(row, stored.bytes))) copied++;
    else failed++;
  }
  return { copied, failed };
}

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
  if (fs.existsSync(localDbPath)) {
    const local = new LocalNoteStore(localDbPath, '');
    try {
      await copyMissingAttachments(local, turso);
    } finally {
      local.close();
    }
  }
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
    await copyMissingAttachments(turso, local);
    return await local.importNotesFromRemote(payload.notes, payload.links, payload.tombstones);
  } finally {
    local.close();
  }
}

import type { Client } from '@libsql/client/web';
import { randomUUID } from '../lib/randomUUID';
import { createNote, deleteNote, getNote, listNotes, updateNote } from '../data/turso';
import { refreshOutgoingLinksForNote } from '../data/noteLinks';
import type { CreateNoteInput, Note, NoteListItem, UpdateNoteInput } from '../types';
import {
  loadNoteCache,
  loadNoteListCache,
  mergeNoteIntoListCache,
  removeNoteCache,
  removeNoteFromListCache,
  saveNoteCache,
  saveNoteListCache,
} from './noteCache';
import { enqueueCreate, enqueueDelete, enqueueUpdate, flushOutbox } from './outbox';

function fullUpdateFromNote(note: Note): UpdateNoteInput {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    tags: note.tags,
    hideHeader: note.hideHeader,
  };
}

/** Fetch list: network when possible; otherwise last cached list. */
export async function loadNotesWithFallback(
  client: Client | null,
  tenantId: string,
  isOnline: boolean,
): Promise<{ notes: NoteListItem[]; fromCache: boolean }> {
  if (client && isOnline) {
    try {
      const rows = await listNotes(client, tenantId);
      await saveNoteListCache(tenantId, rows);
      return { notes: rows, fromCache: false };
    } catch {
      const cached = await loadNoteListCache(tenantId);
      return { notes: cached ?? [], fromCache: true };
    }
  }

  const cached = await loadNoteListCache(tenantId);
  return { notes: cached ?? [], fromCache: true };
}

/** Fetch one note: prefer remote when online; merge into cache. */
export async function loadNoteWithFallback(
  client: Client | null,
  tenantId: string,
  isOnline: boolean,
  noteId: string,
): Promise<Note | null> {
  if (client && isOnline) {
    try {
      const remote = await getNote(client, noteId);
      if (remote) {
        await saveNoteCache(remote);
        return remote;
      }
    } catch {
      // fall through
    }
  }
  return loadNoteCache(noteId);
}

export async function persistNoteUpdate(
  client: Client | null,
  tenantId: string,
  isOnline: boolean,
  base: Note,
  patch: Partial<Pick<Note, 'title' | 'body' | 'tags' | 'hideHeader'>>,
): Promise<Note> {
  const now = new Date().toISOString();
  const merged: Note = {
    ...base,
    ...patch,
    title: patch.title ?? base.title,
    body: patch.body ?? base.body,
    tags: patch.tags ?? base.tags,
    hideHeader: patch.hideHeader ?? base.hideHeader,
    modified: now,
  };

  await saveNoteCache(merged);
  await mergeNoteIntoListCache(tenantId, merged);

  const input = fullUpdateFromNote(merged);

  if (client && isOnline) {
    try {
      const updated = await updateNote(client, input);
      await refreshOutgoingLinksForNote(client, merged.id, tenantId);
      if (updated) {
        await saveNoteCache(updated);
        await mergeNoteIntoListCache(tenantId, updated);
        return updated;
      }
    } catch {
      await enqueueUpdate(tenantId, input);
    }
  } else {
    await enqueueUpdate(tenantId, input);
  }

  return merged;
}

export async function persistNoteCreate(
  client: Client | null,
  tenantId: string,
  isOnline: boolean,
  opts?: { initialTitle?: string },
): Promise<{ note: Note; id: string }> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const title = opts?.initialTitle?.trim() || 'Untitled';

  const stub: Note = {
    id,
    ref: 0,
    title,
    body: '',
    tags: [],
    created: now,
    modified: now,
    tenantId,
    links: [],
    hideHeader: false,
  };

  await saveNoteCache(stub);
  await mergeNoteIntoListCache(tenantId, stub);

  const createInput: CreateNoteInput & { id: string } = {
    id,
    title,
    body: '',
    tags: [],
    tenantId,
    hideHeader: false,
  };

  if (client && isOnline) {
    try {
      const created = await createNote(client, createInput);
      await refreshOutgoingLinksForNote(client, created.id, tenantId);
      await saveNoteCache(created);
      await mergeNoteIntoListCache(tenantId, created);
      return { note: created, id: created.id };
    } catch {
      await enqueueCreate(tenantId, createInput);
      return { note: stub, id };
    }
  } else {
    await enqueueCreate(tenantId, createInput);
    return { note: stub, id };
  }
}

export async function persistNoteDelete(
  client: Client | null,
  tenantId: string,
  isOnline: boolean,
  noteId: string,
): Promise<void> {
  await removeNoteCache(noteId);
  await removeNoteFromListCache(tenantId, noteId);

  if (client && isOnline) {
    try {
      await deleteNote(client, noteId);
    } catch {
      await enqueueDelete(tenantId, noteId);
    }
  } else {
    await enqueueDelete(tenantId, noteId);
  }
}

export async function runFlushOutbox(client: Client, tenantId: string): Promise<{ ok: number; failed: number }> {
  return flushOutbox(client, tenantId);
}

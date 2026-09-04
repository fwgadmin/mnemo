import type { Note, NoteListItem } from '../types';
import { kvGetItem, kvRemoveItem, kvSetItem } from '../storage/asyncStorageSafe';
import { parseStoredTags } from '../lib/noteTags';

const PREFIX = 'mnemo_v1_';

function listKey(tenantId: string): string {
  return `${PREFIX}list_${tenantId}`;
}

function noteKey(id: string): string {
  return `${PREFIX}note_${id}`;
}

export async function saveNoteListCache(tenantId: string, items: NoteListItem[]): Promise<void> {
  await kvSetItem(listKey(tenantId), JSON.stringify(items));
}

export async function loadNoteListCache(tenantId: string): Promise<NoteListItem[] | null> {
  const raw = await kvGetItem(listKey(tenantId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const candidate = item as NoteListItem;
      return {
        ...candidate,
        tags: parseStoredTags(candidate.tags),
        // Lists cached before this contract did not include created.
        created: typeof candidate.created === 'string' ? candidate.created : candidate.modified,
      };
    });
  } catch {
    return null;
  }
}

export async function saveNoteCache(note: Note): Promise<void> {
  await kvSetItem(noteKey(note.id), JSON.stringify(note));
}

export async function loadNoteCache(id: string): Promise<Note | null> {
  const raw = await kvGetItem(noteKey(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Note;
    return { ...parsed, tags: parseStoredTags(parsed.tags) };
  } catch {
    return null;
  }
}

export async function removeNoteCache(id: string): Promise<void> {
  await kvRemoveItem(noteKey(id));
}

function listItemFromNote(n: Note): NoteListItem {
  return {
    ref: n.ref,
    id: n.id,
    title: n.title,
    tags: n.tags,
    created: n.created,
    modified: n.modified,
    snippet: n.body.substring(0, 120),
    hideHeader: n.hideHeader,
  };
}

/** Upsert into cached list and sort by modified desc. */
export async function mergeNoteIntoListCache(tenantId: string, n: Note): Promise<void> {
  const list = (await loadNoteListCache(tenantId)) ?? [];
  const item = listItemFromNote(n);
  const idx = list.findIndex(x => x.id === n.id);
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);
  list.sort((a, b) => (a.modified < b.modified ? 1 : -1));
  await saveNoteListCache(tenantId, list);
}

export async function removeNoteFromListCache(tenantId: string, id: string): Promise<void> {
  const list = (await loadNoteListCache(tenantId)) ?? [];
  await saveNoteListCache(
    tenantId,
    list.filter(x => x.id !== id),
  );
}

/**
 * Category path helpers for the Node CLI — mirrors App.tsx tag semantics (General / Unassigned / nested paths).
 */
import type { INoteStore, NoteListItem } from '../shared/types';
import {
  GENERAL_PATH,
  UNASSIGNED_PATH,
  normalizePath,
  categoryPathFromTags,
  buildCategoryTree,
  flattenTreeDFS,
  promoteCategoryPath,
  pathNestedUnderParent,
  isValidDemoteParent,
} from '../renderer/categoryPath';

export function parseCliCategoryPath(raw: string): string {
  const t = raw.trim();
  if (!t) return UNASSIGNED_PATH;
  if (t === GENERAL_PATH) return GENERAL_PATH;
  if (t === UNASSIGNED_PATH) return UNASSIGNED_PATH;
  return normalizePath(t) || GENERAL_PATH;
}

/** Build tags for a note given the target category path and existing secondary tags (tags[1+]). */
export function tagsForCategoryPath(categoryPath: string, otherTags: string[]): string[] {
  if (categoryPath === UNASSIGNED_PATH) {
    return otherTags;
  }
  if (categoryPath === GENERAL_PATH) {
    return [GENERAL_PATH, ...otherTags];
  }
  return [normalizePath(categoryPath) || GENERAL_PATH, ...otherTags];
}

export function printCategoryTree(notes: NoteListItem[], flat: boolean): void {
  const root = buildCategoryTree(notes);
  if (flat) {
    console.log('path\tdirect\tsubtree');
    for (const node of flattenTreeDFS(root)) {
      console.log(`${node.path}\t${node.directNoteCount}\t${node.subtreeNoteCount}`);
    }
    return;
  }
  console.log('folder\tdirect\tsubtree');
  for (const node of flattenTreeDFS(root)) {
    const indent = '  '.repeat(node.depth);
    const label =
      node.path === GENERAL_PATH ? 'General' : node.path === UNASSIGNED_PATH ? 'Unassigned' : node.segment;
    console.log(`${indent}${label}\t${node.directNoteCount}\t${node.subtreeNoteCount}`);
  }
}

export async function setNoteCategory(
  store: INoteStore,
  vaultList: NoteListItem[],
  noteId: string,
  categoryRaw: string,
): Promise<void> {
  const note = await store.read(noteId);
  if (!note) {
    console.error('Note not found.');
    process.exit(1);
  }
  const item = vaultList.find(n => n.id === noteId);
  const otherTags = item ? item.tags.slice(1) : note.tags.slice(1);
  const target = parseCliCategoryPath(categoryRaw);
  const newTags = tagsForCategoryPath(target, otherTags);
  await store.update({ id: noteId, tags: newTags });
}

export async function renameCategoryFolder(
  store: INoteStore,
  oldPathRaw: string,
  newPathRaw: string,
): Promise<void> {
  const oldPath = parseCliCategoryPath(oldPathRaw);
  const newPath = parseCliCategoryPath(newPathRaw);
  if (oldPath === newPath) {
    console.error('Old and new paths are the same.');
    process.exit(1);
  }
  const initialList = await store.list();
  let updated = 0;
  for (const n of initialList) {
    if (categoryPathFromTags(n.tags, initialList) !== oldPath) continue;
    const otherTags = n.tags.slice(1);
    let newTags: string[];
    if (newPath === UNASSIGNED_PATH) {
      newTags = otherTags;
    } else if (newPath === GENERAL_PATH) {
      newTags = [GENERAL_PATH, ...otherTags];
    } else {
      newTags = [newPath, ...otherTags];
    }
    await store.update({ id: n.id, tags: newTags });
    updated++;
  }
  console.log(`Renamed category: ${updated} note(s) moved from "${oldPath}" to "${newPath}".`);
}

export async function promoteCategoryFolder(store: INoteStore, pathRaw: string): Promise<void> {
  const p = parseCliCategoryPath(pathRaw);
  const next = promoteCategoryPath(p);
  if (next === null) {
    console.error(`Cannot promote "${p}" (already at top level or invalid).`);
    process.exit(1);
  }
  await renameCategoryFolder(store, p, next);
}

export async function demoteCategoryFolder(
  store: INoteStore,
  pathRaw: string,
  parentRaw: string,
): Promise<void> {
  const path = parseCliCategoryPath(pathRaw);
  const parent = parseCliCategoryPath(parentRaw);
  if (!isValidDemoteParent(path, parent)) {
    console.error(`Invalid demote: cannot nest "${path}" under "${parent}".`);
    process.exit(1);
  }
  const next = pathNestedUnderParent(path, parent);
  await renameCategoryFolder(store, path, next);
}

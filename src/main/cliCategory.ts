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

/** Plain objects for `mnemo note categories --json`. */
export function exportCategoryTreeJson(notes: NoteListItem[], flat: boolean): unknown {
  const root = buildCategoryTree(notes);
  const nodes = flattenTreeDFS(root);
  if (flat) {
    return nodes.map(n => ({
      path: n.path,
      direct: n.directNoteCount,
      subtree: n.subtreeNoteCount,
    }));
  }
  return nodes.map(n => ({
    path: n.path,
    depth: n.depth,
    segment: n.segment,
    direct: n.directNoteCount,
    subtree: n.subtreeNoteCount,
  }));
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
    throw new Error('Note not found.');
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
  opts?: { silent?: boolean },
): Promise<{ updated: number; oldPath: string; newPath: string }> {
  const oldPath = parseCliCategoryPath(oldPathRaw);
  const newPath = parseCliCategoryPath(newPathRaw);
  if (oldPath === newPath) {
    throw new Error('Old and new paths are the same.');
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
  if (!opts?.silent) {
    console.log(`Renamed category: ${updated} note(s) moved from "${oldPath}" to "${newPath}".`);
  }
  return { updated, oldPath, newPath };
}

export async function promoteCategoryFolder(
  store: INoteStore,
  pathRaw: string,
  opts?: { silent?: boolean },
): Promise<{ updated: number; oldPath: string; newPath: string }> {
  const p = parseCliCategoryPath(pathRaw);
  const next = promoteCategoryPath(p);
  if (next === null) {
    throw new Error(`Cannot promote "${p}" (already at top level or invalid).`);
  }
  return renameCategoryFolder(store, p, next, opts);
}

export async function demoteCategoryFolder(
  store: INoteStore,
  pathRaw: string,
  parentRaw: string,
  opts?: { silent?: boolean },
): Promise<{ updated: number; oldPath: string; newPath: string }> {
  const path = parseCliCategoryPath(pathRaw);
  const parent = parseCliCategoryPath(parentRaw);
  if (!isValidDemoteParent(path, parent)) {
    throw new Error(`Invalid demote: cannot nest "${path}" under "${parent}".`);
  }
  const next = pathNestedUnderParent(path, parent);
  return renameCategoryFolder(store, path, next, opts);
}

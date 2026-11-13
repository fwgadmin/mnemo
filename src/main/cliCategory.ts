/**
 * Category path helpers for the Node CLI — mirrors App.tsx tag semantics (General / Unassigned / nested paths).
 */
import type { INoteStore, NoteListItem } from '../shared/types';
import { validateCategoryMoveInput } from './categoryBulk';
import {
  GENERAL_PATH,
  UNASSIGNED_PATH,
  VIRTUAL_CATEGORY_ROOT,
  normalizePath,
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
  const nodes = flattenTreeDFS(root).filter(n => n.path !== VIRTUAL_CATEGORY_ROOT);
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
  const rows = flattenTreeDFS(root).filter(n => n.path !== VIRTUAL_CATEGORY_ROOT);
  if (flat) {
    console.log('path\tdirect\tsubtree');
    for (const node of rows) {
      console.log(`${node.path}\t${node.directNoteCount}\t${node.subtreeNoteCount}`);
    }
    return;
  }
  console.log('folder\tdirect\tsubtree');
  for (const node of rows) {
    const indent = '  '.repeat(Math.max(0, node.depth));
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
  opts?: { silent?: boolean; tenantId?: string },
): Promise<{ updated: number; oldPath: string; newPath: string; failures: Array<{ id: string; error: string }> }> {
  const oldPath = parseCliCategoryPath(oldPathRaw);
  const newPath = parseCliCategoryPath(newPathRaw);
  if (oldPath === newPath) {
    throw new Error('Old and new paths are the same.');
  }
  if (newPath.startsWith(`${oldPath}/`)) {
    throw new Error('A category cannot be moved beneath itself.');
  }
  const move = validateCategoryMoveInput({
    sourcePath: oldPath,
    targetPath: newPath,
    includeDescendants: newPath !== UNASSIGNED_PATH,
  });

  const result = await store.moveCategoryPrefix(
    move,
    opts?.tenantId,
  );
  if (!opts?.silent) {
    console.log(`Renamed category: ${result.affected} note(s) moved from "${oldPath}" to "${newPath}".`);
    if (result.failures.length) console.error(`${result.failures.length} note(s) could not be updated.`);
  }
  return { updated: result.affected, oldPath, newPath, failures: result.failures };
}

export async function promoteCategoryFolder(
  store: INoteStore,
  pathRaw: string,
  opts?: { silent?: boolean; tenantId?: string },
): Promise<{ updated: number; oldPath: string; newPath: string; failures: Array<{ id: string; error: string }> }> {
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
  opts?: { silent?: boolean; tenantId?: string },
): Promise<{ updated: number; oldPath: string; newPath: string; failures: Array<{ id: string; error: string }> }> {
  const path = parseCliCategoryPath(pathRaw);
  const parent = parseCliCategoryPath(parentRaw);
  if (!isValidDemoteParent(path, parent)) {
    throw new Error(`Invalid demote: cannot nest "${path}" under "${parent}".`);
  }
  const next = pathNestedUnderParent(path, parent);
  return renameCategoryFolder(store, path, next, opts);
}

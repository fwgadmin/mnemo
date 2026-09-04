/**
 * Aligned with desktop [src/renderer/categoryPath.ts] — first tag = folder path.
 */

import type { NoteListItem } from '../types';

/** Default category when tags[0] is empty */
export const GENERAL_PATH = 'General';

/** Uncategorized notes when the vault also has at least one assigned category */
export const UNASSIGNED_PATH = 'Unassigned';

/** Normalize: trim, collapse slashes, strip leading/trailing slashes */
export function normalizePath(s: string): string {
  return s.trim().replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '') || '';
}

/** Key used in categoryColors (matches desktop handleSetCategoryColor) */
export function categoryColorStorageKey(path: string): string {
  return normalizePath(path) || GENERAL_PATH;
}

/** True if path is the Archive bucket or nested under it. */
export function isArchiveCategoryPath(folderPath: string): boolean {
  const n = normalizePath(folderPath) || GENERAL_PATH;
  return n === 'Archive' || n.startsWith('Archive/');
}

export function countNotesInCategorySubtree(notes: NoteListItem[], folderPath: string): number {
  const fp = normalizePath(folderPath) || GENERAL_PATH;
  let c = 0;
  for (const n of notes) {
    const cur = categoryPathFromTags(n.tags, notes);
    if (cur === fp || cur.startsWith(`${fp}/`)) c++;
  }
  return c;
}

export function hasNonEmptyFirstTag(tags: string[]): boolean {
  return tags.length > 0 && !!normalizePath(tags[0]);
}

export function vaultHasAssignedCategories(notes: NoteListItem[]): boolean {
  return notes.some(n => hasNonEmptyFirstTag(n.tags));
}

export function resolveCategoryPath(tags: string[], hasAssignedCategories: boolean): string {
  if (!tags.length) return hasAssignedCategories ? UNASSIGNED_PATH : GENERAL_PATH;
  const n = normalizePath(tags[0]);
  if (!n) return hasAssignedCategories ? UNASSIGNED_PATH : GENERAL_PATH;
  return n === GENERAL_PATH ? GENERAL_PATH : n;
}

export function categoryPathFromTags(tags: string[], vaultNotes?: NoteListItem[] | null): string {
  if (tags.length) {
    const normalized = normalizePath(tags[0]);
    if (normalized) return normalized === GENERAL_PATH ? GENERAL_PATH : normalized;
  }
  return resolveCategoryPath(tags, !!vaultNotes && vaultHasAssignedCategories(vaultNotes));
}

export function splitPath(path: string): string[] {
  if (path === GENERAL_PATH) return [];
  const n = normalizePath(path);
  if (!n) return [];
  return n.split('/');
}

export function parentPath(path: string): string | null {
  if (path === GENERAL_PATH) return null;
  if (path === UNASSIGNED_PATH) return null;
  const parts = splitPath(path);
  if (parts.length === 0) return null;
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('/');
}

export function promoteCategoryPath(path: string): string | null {
  if (path === GENERAL_PATH) return null;
  if (path === UNASSIGNED_PATH) return GENERAL_PATH;
  const parts = splitPath(path);
  if (parts.length <= 1) return GENERAL_PATH;
  return parts.slice(1).join('/');
}

export function pathNestedUnderParent(childPath: string, parent: string): string {
  const c = normalizePath(childPath);
  const p = normalizePath(parent);
  if (!c) return GENERAL_PATH;
  if (!p || p === GENERAL_PATH) return c;
  return normalizePath(`${p}/${c}`) || p;
}

export function isValidDemoteParent(folderPath: string, parent: string): boolean {
  const f = normalizePath(folderPath) || GENERAL_PATH;
  const p = normalizePath(parent) || GENERAL_PATH;
  if (f === p) return false;
  if (p === GENERAL_PATH) return false;

  if (f === GENERAL_PATH) {
    if (p === UNASSIGNED_PATH) return false;
    if (p.startsWith(`${f}/`) || f.startsWith(`${p}/`)) return false;
    const pSegs = splitPath(p);
    if (pSegs.includes(GENERAL_PATH)) return false;
    return true;
  }

  if (p.startsWith(`${f}/`) || f.startsWith(`${p}/`)) return false;
  const segs = splitPath(f);
  if (segs.includes(p)) return false;
  return true;
}

export function categoryDisplayDepth(path: string): number {
  if (path === GENERAL_PATH || path === UNASSIGNED_PATH) return 0;
  const parts = splitPath(path);
  return Math.max(0, parts.length - 1);
}

export function pathInSubtree(
  notePath: string,
  folderPath: string,
  includeDescendants: boolean,
): boolean {
  const np = notePath;
  const fp = folderPath === GENERAL_PATH ? GENERAL_PATH : normalizePath(folderPath) || GENERAL_PATH;
  if (fp === UNASSIGNED_PATH) {
    return np === UNASSIGNED_PATH;
  }
  if (fp === GENERAL_PATH) {
    if (includeDescendants) return true;
    return np === GENERAL_PATH;
  }
  if (!includeDescendants) return np === fp;
  return np === fp || np.startsWith(`${fp}/`);
}

export function filterNotesByCategory(
  notes: NoteListItem[],
  folderPath: string | null,
  includeDescendants: boolean,
  model?: CategoryModel,
): NoteListItem[] {
  if (folderPath === null) return notes;
  return notes.filter(n => {
    const p = model?.pathByNoteId.get(n.id) ?? categoryPathFromTags(n.tags, notes);
    return pathInSubtree(p, folderPath, includeDescendants);
  });
}

export function ancestorPaths(leafPath: string): string[] {
  if (leafPath === GENERAL_PATH) return [GENERAL_PATH];
  if (leafPath === UNASSIGNED_PATH) return [UNASSIGNED_PATH];
  const parts = splitPath(leafPath);
  if (parts.length === 0) return [GENERAL_PATH];
  const out: string[] = [];
  let acc = '';
  for (const seg of parts) {
    acc = acc ? `${acc}/${seg}` : seg;
    out.push(acc);
  }
  return out;
}

export interface CategoryTreeNode {
  path: string;
  segment: string;
  depth: number;
  directNoteCount: number;
  subtreeNoteCount: number;
  children: CategoryTreeNode[];
}

export const VIRTUAL_CATEGORY_ROOT = '';

export interface CategoryModel {
  hasAssignedCategories: boolean;
  root: CategoryTreeNode;
  notesByPath: Map<string, NoteListItem[]>;
  pathByNoteId: Map<string, string>;
  nodesByPath: Map<string, CategoryTreeNode>;
}

function categorySegment(path: string): string {
  if (path === GENERAL_PATH) return 'General';
  if (path === UNASSIGNED_PATH) return 'Unassigned';
  return splitPath(path).at(-1) ?? path;
}

function compareCategoryPaths(a: string, b: string): number {
  return categorySegment(a).localeCompare(categorySegment(b), undefined, { sensitivity: 'base' });
}

/** Keep this pure implementation aligned with desktop's category model. */
export function buildCategoryModel(
  notes: NoteListItem[],
  assignedCategories = vaultHasAssignedCategories(notes),
): CategoryModel {
  const notesByPath = new Map<string, NoteListItem[]>();
  const pathByNoteId = new Map<string, string>();
  const allPaths = new Set<string>();

  for (const note of notes) {
    const path = resolveCategoryPath(note.tags, assignedCategories);
    pathByNoteId.set(note.id, path);
    const pathNotes = notesByPath.get(path);
    if (pathNotes) pathNotes.push(note);
    else notesByPath.set(path, [note]);
    for (const ancestor of ancestorPaths(path)) allPaths.add(ancestor);
  }
  if (allPaths.size === 0) allPaths.add(GENERAL_PATH);

  const childrenByParent = new Map<string, string[]>();
  for (const path of allPaths) {
    const parent = parentPath(path) ?? VIRTUAL_CATEGORY_ROOT;
    const children = childrenByParent.get(parent);
    if (children) children.push(path);
    else childrenByParent.set(parent, [path]);
  }
  for (const children of childrenByParent.values()) children.sort(compareCategoryPaths);

  const nodesByPath = new Map<string, CategoryTreeNode>();
  function buildNode(path: string): CategoryTreeNode {
    const children = (childrenByParent.get(path) ?? []).map(buildNode);
    const directNoteCount = notesByPath.get(path)?.length ?? 0;
    const node: CategoryTreeNode = {
      path,
      segment: path === VIRTUAL_CATEGORY_ROOT ? '' : categorySegment(path),
      depth: path === VIRTUAL_CATEGORY_ROOT ? -1 : categoryDisplayDepth(path),
      directNoteCount,
      subtreeNoteCount:
        directNoteCount + children.reduce((total, child) => total + child.subtreeNoteCount, 0),
      children,
    };
    nodesByPath.set(path, node);
    return node;
  }

  const root = buildNode(VIRTUAL_CATEGORY_ROOT);
  return { hasAssignedCategories: assignedCategories, root, notesByPath, pathByNoteId, nodesByPath };
}

export function buildCategoryTree(notes: NoteListItem[]): CategoryTreeNode {
  return buildCategoryModel(notes).root;
}

export function flattenTreeDFS(node: CategoryTreeNode): CategoryTreeNode[] {
  return [node, ...node.children.flatMap(flattenTreeDFS)];
}

/** Visible rows in tree order; respects `expanded` (collapsed nodes hide descendants). */
export function flattenCategoryTreeVisible(
  root: CategoryTreeNode,
  expanded: Set<string>,
): CategoryTreeNode[] {
  const out: CategoryTreeNode[] = [];
  function walk(node: CategoryTreeNode) {
    if (node.path === VIRTUAL_CATEGORY_ROOT) {
      for (const c of node.children) walk(c);
      return;
    }
    out.push(node);
    if (expanded.has(node.path)) {
      for (const c of node.children) walk(c);
    }
  }
  walk(root);
  return out;
}

/** Paths that have at least one child folder in the tree. */
export function pathsWithChildren(root: CategoryTreeNode): Set<string> {
  const s = new Set<string>();
  function walk(node: CategoryTreeNode) {
    if (node.path !== VIRTUAL_CATEGORY_ROOT && node.children.length > 0) s.add(node.path);
    for (const c of node.children) walk(c);
  }
  walk(root);
  return s;
}

export function distinctCategoryPaths(notes: NoteListItem[]): string[] {
  const s = new Set<string>();
  const hasDirectGeneral = notes.some(n => categoryPathFromTags(n.tags, notes) === GENERAL_PATH);
  for (const n of notes) {
    const p = categoryPathFromTags(n.tags, notes);
    s.add(p);
    for (const a of ancestorPaths(p)) s.add(a);
  }
  if (!hasDirectGeneral) {
    s.delete(GENERAL_PATH);
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Distinct leaf paths only (notes’ categories), sorted — for simple flat lists. */
export function uniqueCategoryPaths(notes: NoteListItem[], model?: CategoryModel): string[] {
  const set = new Set<string>();
  for (const n of notes) {
    set.add(model?.pathByNoteId.get(n.id) ?? categoryPathFromTags(n.tags, notes));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

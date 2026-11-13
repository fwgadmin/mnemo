import type { NoteListItem } from '../shared/types';

/** Default category when tags[0] is empty */
export const GENERAL_PATH = 'General';

/** Uncategorized notes when the vault also has at least one assigned category */
export const UNASSIGNED_PATH = 'Unassigned';

/** Normalize: trim, collapse slashes, strip leading/trailing slashes */
export function normalizePath(s: string): string {
  return s.trim().replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '') || '';
}

/** Key used in categoryColors / localStorage (matches handleSetCategoryColor) */
export function categoryColorStorageKey(path: string): string {
  return normalizePath(path) || GENERAL_PATH;
}

/** True if path is the Archive bucket or nested under it (archive again would duplicate the prefix). */
export function isArchiveCategoryPath(folderPath: string): boolean {
  const n = normalizePath(folderPath) || GENERAL_PATH;
  return n === 'Archive' || n.startsWith('Archive/');
}

/** Notes whose category path equals `folderPath` or is nested under it. */
export function countNotesInCategorySubtree(
  notes: NoteListItem[],
  folderPath: string,
  model?: CategoryModel,
): number {
  const fp = normalizePath(folderPath) || GENERAL_PATH;
  if (model) return model.nodesByPath.get(fp)?.subtreeNoteCount ?? 0;
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

/** True if any note has a non-empty first tag (a real category assignment). */
export function vaultHasAssignedCategories(notes: NoteListItem[]): boolean {
  return notes.some(n => hasNonEmptyFirstTag(n.tags));
}

/** Resolve a note category using a vault-level value computed once by the caller. */
export function resolveCategoryPath(tags: string[], hasAssignedCategories: boolean): string {
  if (!tags.length) return hasAssignedCategories ? UNASSIGNED_PATH : GENERAL_PATH;
  const n = normalizePath(tags[0]);
  if (!n) return hasAssignedCategories ? UNASSIGNED_PATH : GENERAL_PATH;
  return n === GENERAL_PATH ? GENERAL_PATH : n;
}

/**
 * Category path from note tags. Empty first tag → General when no one else is categorized,
 * otherwise Unassigned. Explicit first tag "General" → General bucket.
 * Pass `vaultNotes` so empty tags resolve to Unassigned when the vault has other categories (UI and `mnemo note list -v`).
 */
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

/**
 * Parent folder path, or null for top-level buckets (General, Unassigned, agntsea, Blackhat, …).
 * There is no implicit "everything lives under General" — only nested paths have a parent.
 */
export function parentPath(path: string): string | null {
  if (path === GENERAL_PATH) return null;
  if (path === UNASSIGNED_PATH) return null;
  const parts = splitPath(path);
  if (parts.length === 0) return null;
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('/');
}

/** Move one level up: `Work/Meetings` → `Meetings`; `Work` → General. Returns null only for General. */
export function promoteCategoryPath(path: string): string | null {
  if (path === GENERAL_PATH) return null;
  if (path === UNASSIGNED_PATH) return GENERAL_PATH;
  const parts = splitPath(path);
  if (parts.length <= 1) return GENERAL_PATH;
  return parts.slice(1).join('/');
}

/** Nest full path under a parent folder: `Work` + `Archive` → `Archive/Work`. No-op if parent is General. */
export function pathNestedUnderParent(childPath: string, parent: string): string {
  const c = normalizePath(childPath);
  const p = normalizePath(parent);
  if (!c) return GENERAL_PATH;
  if (!p || p === GENERAL_PATH) return c;
  return normalizePath(`${p}/${c}`) || p;
}

/** Parent must not equal the folder or sit on the same branch (avoid `Work` + parent `Work/Meetings`). */
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

/**
 * Sidebar / tree indent: top-level folders (General, Unassigned, Work, …) share depth 0;
 * each extra path segment adds one level (Work/Meetings → 1).
 */
export function categoryDisplayDepth(path: string): number {
  if (path === GENERAL_PATH || path === UNASSIGNED_PATH) return 0;
  const parts = splitPath(path);
  return Math.max(0, parts.length - 1);
}

/** Note path is under folder prefix (prefix is a folder path, not necessarily a leaf) */
export function pathInSubtree(notePath: string, folderPath: string, includeDescendants: boolean): boolean {
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

/** All ancestor folder paths for expand/scroll (flat roots: no synthetic General parent). */
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
  /** Total notes in this folder and descendants */
  subtreeNoteCount: number;
  children: CategoryTreeNode[];
}

/** Internal tree root (not a real folder — never shown or stored as a tag). */
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

/**
 * Build all category indexes in one pass over notes and one pass over category paths.
 * Child ordering and subtree counts are finalized once, before rendering.
 */
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

/** Multi-root category tree: top-level folders are siblings (General, Unassigned, agntsea, …), not children of General. */
export function buildCategoryTree(notes: NoteListItem[]): CategoryTreeNode {
  return buildCategoryModel(notes).root;
}

/** Keep only folders that have a direct note or a descendant with a note in the map (for tree UI). */
export function pruneCategoryTree(
  node: CategoryTreeNode,
  notesByPath: Map<string, NoteListItem[]>,
): CategoryTreeNode | null {
  const hasDirect = (notesByPath.get(node.path)?.length ?? 0) > 0;
  const childPruned = node.children
    .map(c => pruneCategoryTree(c, notesByPath))
    .filter((x): x is CategoryTreeNode => x !== null);
  if (hasDirect || childPruned.length > 0 || node.path === VIRTUAL_CATEGORY_ROOT) {
    const directNoteCount = notesByPath.get(node.path)?.length ?? 0;
    return {
      ...node,
      directNoteCount,
      subtreeNoteCount:
        directNoteCount + childPruned.reduce((total, child) => total + child.subtreeNoteCount, 0),
      children: childPruned,
    };
  }
  return null;
}

/** Pre-order flatten for rendering */
export function flattenTreeDFS(node: CategoryTreeNode): CategoryTreeNode[] {
  return [node, ...node.children.flatMap(flattenTreeDFS)];
}

export function findNodeByPath(root: CategoryTreeNode, path: string): CategoryTreeNode | null {
  if (root.path === path) return root;
  for (const c of root.children) {
    const f = findNodeByPath(c, path);
    if (f) return f;
  }
  return null;
}

/** Order category paths as they appear in a pre-order walk of the tree (virtual root omitted). */
export function sortPathsByTreeOrder(paths: string[], tree: CategoryTreeNode): string[] {
  const index = new Map<string, number>();
  flattenTreeDFS(tree).forEach((n, i) => index.set(n.path, i));
  return [...paths].sort((a, b) => {
    const ia = index.get(a);
    const ib = index.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b);
  });
}

/** Sorted distinct paths for combobox */
export function distinctCategoryPaths(notes: NoteListItem[], model?: CategoryModel): string[] {
  const s = new Set<string>();
  const hasDirectGeneral = model
    ? (model.notesByPath.get(GENERAL_PATH)?.length ?? 0) > 0
    : notes.some(n => categoryPathFromTags(n.tags, notes) === GENERAL_PATH);
  for (const n of notes) {
    const p = model?.pathByNoteId.get(n.id) ?? categoryPathFromTags(n.tags, notes);
    s.add(p);
    for (const a of ancestorPaths(p)) s.add(a);
  }
  /* Structural root "General" is injected as an ancestor of every path; without this, the list
   * still shows General after you rename the bucket away — looks like a duplicate folder. */
  if (!hasDirectGeneral) {
    s.delete(GENERAL_PATH);
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

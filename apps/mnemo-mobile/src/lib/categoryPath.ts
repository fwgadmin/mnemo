/**
 * Subset of desktop [src/renderer/categoryPath.ts] — first tag = folder path.
 */

import type { NoteListItem } from '../types';

export const GENERAL_PATH = 'General';
export const UNASSIGNED_PATH = 'Unassigned';

export function normalizePath(s: string): string {
  return s.trim().replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '') || '';
}

export function hasNonEmptyFirstTag(tags: string[]): boolean {
  return tags.length > 0 && !!normalizePath(tags[0]);
}

export function vaultHasAssignedCategories(notes: NoteListItem[]): boolean {
  return notes.some(n => hasNonEmptyFirstTag(n.tags));
}

export function categoryPathFromTags(tags: string[], vaultNotes?: NoteListItem[] | null): string {
  if (!tags.length) {
    if (vaultNotes && vaultHasAssignedCategories(vaultNotes)) return UNASSIGNED_PATH;
    return GENERAL_PATH;
  }
  const n = normalizePath(tags[0]);
  if (!n) {
    if (vaultNotes && vaultHasAssignedCategories(vaultNotes)) return UNASSIGNED_PATH;
    return GENERAL_PATH;
  }
  if (n === GENERAL_PATH) return GENERAL_PATH;
  return n;
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
): NoteListItem[] {
  if (folderPath === null) return notes;
  return notes.filter(n => {
    const p = categoryPathFromTags(n.tags, notes);
    return pathInSubtree(p, folderPath, includeDescendants);
  });
}

/** Distinct category paths present in the vault (for filter chips). */
export function uniqueCategoryPaths(notes: NoteListItem[]): string[] {
  const set = new Set<string>();
  for (const n of notes) {
    set.add(categoryPathFromTags(n.tags, notes));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

import type { CategorySortMode, NoteListItem } from '../shared/types';
import { GENERAL_PATH, categoryColorStorageKey, parentPath } from './categoryPath';

export function readCategorySortModes(): Record<string, CategorySortMode> {
  try {
    const raw = localStorage.getItem('mnemo.categorySortModes');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, CategorySortMode> = {};
    for (const [path, mode] of Object.entries(parsed)) {
      if (mode === 'alphabetical' || mode === 'created-desc' || mode === 'created-asc') out[path] = mode;
    }
    return out;
  } catch {
    return {};
  }
}

export function resolveCategorySortMode(
  path: string,
  modes: Record<string, CategorySortMode>,
): CategorySortMode {
  let current: string | null = categoryColorStorageKey(path);
  while (current) {
    if (modes[current]) return modes[current]!;
    if (current === GENERAL_PATH) break;
    current = parentPath(current);
  }
  return 'alphabetical';
}

export function sortNotesForCategory(
  notes: readonly NoteListItem[],
  path: string,
  modes: Record<string, CategorySortMode>,
): NoteListItem[] {
  const mode = resolveCategorySortMode(path, modes);
  return [...notes].sort((a, b) => {
    if (mode !== 'alphabetical') {
      const aTime = Date.parse(a.created) || 0;
      const bTime = Date.parse(b.created) || 0;
      const dateOrder = mode === 'created-desc' ? bTime - aTime : aTime - bTime;
      if (dateOrder !== 0) return dateOrder;
    }
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  });
}


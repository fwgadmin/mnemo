import { bench, describe } from 'vitest';
import type { NoteListItem } from '../shared/types';
import {
  GENERAL_PATH,
  UNASSIGNED_PATH,
  ancestorPaths,
  buildCategoryModel,
  categoryDisplayDepth,
  normalizePath,
  parentPath,
  splitPath,
  vaultHasAssignedCategories,
  type CategoryTreeNode,
} from './categoryPath';

const notes: NoteListItem[] = Array.from({ length: 10_000 }, (_, index) => ({
  id: String(index),
  ref: index,
  title: `Note ${index}`,
  tags: [`Area-${index % 100}/Topic-${index % 1_000}`],
  created: '2026-01-01T00:00:00.000Z',
  modified: '2026-01-01T00:00:00.000Z',
  snippet: '',
}));

/** MNE-009 baseline retained only to make the benchmark reproducible. */
function buildLegacyCategoryTree(vaultNotes: NoteListItem[]): CategoryTreeNode {
  const byPath = new Map<string, NoteListItem[]>();
  for (const note of vaultNotes) {
    const normalized = normalizePath(note.tags[0] ?? '');
    const path = normalized || (vaultHasAssignedCategories(vaultNotes) ? UNASSIGNED_PATH : GENERAL_PATH);
    const existing = byPath.get(path);
    if (existing) existing.push(note);
    else byPath.set(path, [note]);
  }

  const allPaths = new Set(byPath.keys());
  for (const path of [...allPaths]) {
    for (const ancestor of ancestorPaths(path)) allPaths.add(ancestor);
  }

  function buildNode(path: string): CategoryTreeNode {
    const childPaths = [...allPaths]
      .filter(candidate => (path === '' ? parentPath(candidate) === null : parentPath(candidate) === path))
      .filter(candidate => candidate !== path)
      .sort((a, b) => (splitPath(a).at(-1) ?? '').localeCompare(splitPath(b).at(-1) ?? ''));
    const children = childPaths.map(buildNode);
    const directNoteCount = byPath.get(path)?.length ?? 0;
    return {
      path,
      segment: path === '' ? '' : splitPath(path).at(-1) ?? path,
      depth: path === '' ? -1 : categoryDisplayDepth(path),
      directNoteCount,
      subtreeNoteCount:
        directNoteCount + children.reduce((total, child) => total + child.subtreeNoteCount, 0),
      children,
    };
  }
  return buildNode('');
}

describe('10,000 notes across 1,000 category paths', () => {
  bench('MNE-009 indexed model', () => {
    buildCategoryModel(notes);
  });

  bench('pre-MNE-009 repeated path filtering', () => {
    buildLegacyCategoryTree(notes);
  });
});

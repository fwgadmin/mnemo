import { describe, expect, it } from 'vitest';
import type { NoteListItem } from '../shared/types';
import {
  GENERAL_PATH,
  UNASSIGNED_PATH,
  buildCategoryTree,
  categoryPathFromTags,
  filterNotesByCategory,
} from './categoryPath';

function item(id: string, tags: string[]): NoteListItem {
  return {
    id,
    ref: Number(id),
    title: `Note ${id}`,
    tags,
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    snippet: '',
  };
}

describe('category paths', () => {
  it('uses General for an entirely uncategorized vault', () => {
    const notes = [item('1', []), item('2', [])];
    expect(categoryPathFromTags(notes[0]!.tags, notes)).toBe(GENERAL_PATH);
  });

  it('uses Unassigned when another note has a category', () => {
    const notes = [item('1', []), item('2', ['Work/Meetings'])];
    expect(categoryPathFromTags(notes[0]!.tags, notes)).toBe(UNASSIGNED_PATH);
  });

  it('builds nested counts and subtree filtering consistently', () => {
    const notes = [
      item('1', ['Work']),
      item('2', ['Work/Meetings']),
      item('3', ['Work/Meetings']),
      item('4', ['Personal']),
    ];
    const tree = buildCategoryTree(notes);
    const work = tree.children.find(node => node.path === 'Work');
    expect(work).toMatchObject({ directNoteCount: 1, subtreeNoteCount: 3 });
    expect(work?.children[0]).toMatchObject({ path: 'Work/Meetings', directNoteCount: 2 });
    expect(filterNotesByCategory(notes, 'Work', true).map(note => note.id)).toEqual(['1', '2', '3']);
    expect(filterNotesByCategory(notes, 'Work', false).map(note => note.id)).toEqual(['1']);
  });
});

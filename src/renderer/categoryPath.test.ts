import { describe, expect, it } from 'vitest';
import type { NoteListItem } from '../shared/types';
import {
  GENERAL_PATH,
  UNASSIGNED_PATH,
  buildCategoryModel,
  buildCategoryTree,
  categoryPathFromTags,
  filterNotesByCategory,
  pruneCategoryTree,
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

  it('indexes resolved paths, notes, sorted children, and nodes in one model', () => {
    const notes = [
      item('1', []),
      item('2', ['work/Zeta']),
      item('3', ['work/alpha']),
      item('4', ['work/alpha']),
    ];
    const model = buildCategoryModel(notes);

    expect(model.hasAssignedCategories).toBe(true);
    expect(model.pathByNoteId.get('1')).toBe(UNASSIGNED_PATH);
    expect(model.notesByPath.get('work/alpha')?.map(note => note.id)).toEqual(['3', '4']);
    expect(model.nodesByPath.get('work')).toMatchObject({
      directNoteCount: 0,
      subtreeNoteCount: 3,
    });
    expect(model.nodesByPath.get('work')?.children.map(node => node.segment)).toEqual([
      'alpha',
      'Zeta',
    ]);
  });

  it('recomputes pruned subtree counts for the displayed note set', () => {
    const notes = [item('1', ['Work']), item('2', ['Work/Meetings']), item('3', ['Personal'])];
    const model = buildCategoryModel(notes);
    const visibleNotes = new Map([['Work/Meetings', [notes[1]!]]]);
    const pruned = pruneCategoryTree(model.root, visibleNotes);

    expect(pruned?.subtreeNoteCount).toBe(1);
    expect(pruned?.children.map(node => node.path)).toEqual(['Work']);
    expect(pruned?.children[0]?.subtreeNoteCount).toBe(1);
  });

  it('builds the 10,000-note / 1,000-path benchmark fixture within a linear-time budget', () => {
    const notes = Array.from({ length: 10_000 }, (_, index) =>
      item(String(index), [`Area-${index % 100}/Topic-${index % 1_000}`]),
    );
    const started = performance.now();
    const model = buildCategoryModel(notes);
    const elapsedMs = performance.now() - started;

    expect(model.pathByNoteId.size).toBe(10_000);
    expect(model.notesByPath.size).toBe(1_000);
    expect(model.root.subtreeNoteCount).toBe(10_000);
    expect(elapsedMs).toBeLessThan(2_000);
  });
});

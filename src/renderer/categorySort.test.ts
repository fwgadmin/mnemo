import { describe, expect, it } from 'vitest';
import type { NoteListItem } from '../shared/types';
import { resolveCategorySortMode, sortNotesForCategory } from './categorySort';

function item(id: string, title: string, created: string): NoteListItem {
  return { id, ref: Number(id), title, tags: ['Work'], created, modified: created, snippet: '' };
}

describe('category note sorting', () => {
  const notes = [
    item('1', 'Zulu', '2024-01-01T00:00:00.000Z'),
    item('2', 'Alpha', '2026-01-01T00:00:00.000Z'),
    item('3', 'Beta', '2025-01-01T00:00:00.000Z'),
  ];

  it('inherits the nearest parent override', () => {
    const modes = { Work: 'created-desc' as const, 'Work/Meetings': 'created-asc' as const };
    expect(resolveCategorySortMode('Work/Planning', modes)).toBe('created-desc');
    expect(resolveCategorySortMode('Work/Meetings/Weekly', modes)).toBe('created-asc');
    expect(resolveCategorySortMode('Personal', modes)).toBe('alphabetical');
  });

  it('sorts alphabetically, newest-first, and oldest-first', () => {
    expect(sortNotesForCategory(notes, 'Work', {}).map(note => note.title)).toEqual(['Alpha', 'Beta', 'Zulu']);
    expect(sortNotesForCategory(notes, 'Work', { Work: 'created-desc' }).map(note => note.title)).toEqual([
      'Alpha',
      'Beta',
      'Zulu',
    ]);
    expect(sortNotesForCategory(notes, 'Work', { Work: 'created-asc' }).map(note => note.title)).toEqual([
      'Zulu',
      'Beta',
      'Alpha',
    ]);
  });
});

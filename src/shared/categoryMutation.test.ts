import { describe, expect, it } from 'vitest';
import { remapCategoryKeys, tagsForCategoryMove } from './categoryMutation';

describe('category mutations', () => {
  it('rewrites exact and descendant paths while preserving secondary tags', () => {
    expect(tagsForCategoryMove(['Work', 'urgent'], 'Work', 'Work', 'Projects', true))
      .toEqual(['Projects', 'urgent']);
    expect(tagsForCategoryMove(['Work/Meetings', 'urgent'], 'Work/Meetings', 'Work', 'Projects', true))
      .toEqual(['Projects/Meetings', 'urgent']);
    expect(tagsForCategoryMove(['Work/Meetings'], 'Work/Meetings', 'Work', 'Unassigned', false))
      .toBeNull();
    expect(tagsForCategoryMove(['Work', 'urgent'], 'Work', 'Work', 'Unassigned', false))
      .toEqual(['urgent']);
  });

  it('remaps colors, stamps, and sort-mode-shaped records without mutating the source', () => {
    const source = { Work: 'root', 'Work/Meetings': 'child', Personal: 'other' };
    expect(remapCategoryKeys(source, 'Work', 'Archive/Work')).toEqual({
      'Archive/Work': 'root',
      'Archive/Work/Meetings': 'child',
      Personal: 'other',
    });
    expect(remapCategoryKeys(source, 'Work', 'Archive/Work', true, true)).toEqual({
      Work: 'root',
      'Work/Meetings': 'child',
      'Archive/Work': 'root',
      'Archive/Work/Meetings': 'child',
      Personal: 'other',
    });
    expect(source).toHaveProperty('Work');
  });
});

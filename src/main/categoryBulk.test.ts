import { describe, expect, it } from 'vitest';
import { validateBulkDeleteIds, validateCategoryMoveInput } from './categoryBulk';

describe('bulk category request validation', () => {
  it('normalizes paths and forces Unassigned moves to exact-folder scope', () => {
    expect(validateCategoryMoveInput({
      sourcePath: ' /Work//Meetings/ ',
      targetPath: 'Unassigned',
      includeDescendants: true,
    })).toEqual({
      sourcePath: 'Work/Meetings',
      targetPath: 'Unassigned',
      includeDescendants: false,
    });
  });

  it('rejects self-nesting and malformed deletion ids', () => {
    expect(() => validateCategoryMoveInput({
      sourcePath: 'Work', targetPath: 'Work/Archive', includeDescendants: true,
    })).toThrow('beneath itself');
    expect(() => validateBulkDeleteIds(['ok', ''])).toThrow('Invalid note id');
    expect(validateBulkDeleteIds(['a', 'a', 'b'])).toEqual(['a', 'b']);
  });
});

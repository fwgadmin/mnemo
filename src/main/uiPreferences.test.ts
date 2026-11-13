import { describe, expect, it } from 'vitest';
import { mergeCategoryColorDiskCloud, mergePrefs, sanitizePrefs } from './uiPreferences';

describe('UI preference sanitization and merging', () => {
  it('keeps valid category modes and removes invalid values', () => {
    expect(
      sanitizePrefs({
        categorySortModes: { Work: 'created-desc', Bad: 'random' },
        categoryColors: { Work: '#aabbcc', Bad: 'red' },
        showSidebar: true,
      }),
    ).toMatchObject({
      categorySortModes: { Work: 'created-desc' },
      categoryColors: { Work: '#aabbcc' },
      showSidebar: true,
    });
  });

  it('allows an explicit empty tab list to clear persisted tabs', () => {
    expect(mergePrefs({ ideTabIds: ['00000000-0000-4000-8000-000000000001'] }, { ideTabIds: [] }).ideTabIds).toBeUndefined();
  });

  it('uses the newest per-category color stamp', () => {
    expect(
      mergeCategoryColorDiskCloud(
        { categoryColors: { Work: '#111111' }, categoryColorStamps: { Work: 10 } },
        { categoryColors: { Work: '#eeeeee' }, categoryColorStamps: { Work: 20 } },
      ),
    ).toEqual({ categoryColors: { Work: '#eeeeee' }, categoryColorStamps: { Work: 20 } });
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { INoteStore } from '../shared/types';
import { renameCategoryFolder } from './cliCategory';

describe('CLI category bulk operations', () => {
  it('delegates a subtree rename to one store operation', async () => {
    const moveCategoryPrefix = vi.fn(async () => ({
      requested: 500,
      affected: 500,
      affectedIds: [],
      failures: [],
      changes: [],
    }));
    const store = { moveCategoryPrefix } as unknown as INoteStore;

    await expect(renameCategoryFolder(store, 'Work', 'Projects', {
      silent: true,
      tenantId: 'tenant-a',
    })).resolves.toMatchObject({ updated: 500, oldPath: 'Work', newPath: 'Projects' });
    expect(moveCategoryPrefix).toHaveBeenCalledTimes(1);
    expect(moveCategoryPrefix).toHaveBeenCalledWith({
      sourcePath: 'Work',
      targetPath: 'Projects',
      includeDescendants: true,
    }, 'tenant-a');
  });
});

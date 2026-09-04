import { describe, expect, it } from 'vitest';
import type { WorkspaceProfilesState } from '../shared/types';
import { pickWorkspaceId, resolveWorkspaceSelector } from './workspaceResolve';

const profiles: WorkspaceProfilesState = {
  activeWorkspaceId: 'work',
  workspaces: [
    { id: 'default', name: 'Default' },
    { id: 'work', name: 'Work' },
  ],
};

describe('workspace selector', () => {
  it('resolves active, index, and ID selectors', () => {
    expect(pickWorkspaceId(profiles, resolveWorkspaceSelector(profiles, undefined) as { kind: 'active' })).toBe('work');
    expect(resolveWorkspaceSelector(profiles, '1')).toEqual({ kind: 'id', id: 'default' });
    expect(resolveWorkspaceSelector(profiles, 'work')).toEqual({ kind: 'id', id: 'work' });
  });

  it('reports invalid selectors', () => {
    expect(resolveWorkspaceSelector(profiles, '3').kind).toBe('error');
    expect(resolveWorkspaceSelector(profiles, 'missing').kind).toBe('error');
  });
});

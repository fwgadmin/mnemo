import { describe, expect, it } from 'vitest';
import { createWorkspaceContextSession } from './storeResolver';

describe('WorkspaceContextSession', () => {
  it('keeps selections independent between simultaneous MCP sessions', () => {
    const first = createWorkspaceContextSession('default');
    const second = createWorkspaceContextSession('work');

    first.setWorkspaceId('personal');
    expect(first.getWorkspaceId()).toBe('personal');
    expect(second.getWorkspaceId()).toBe('work');

    second.setWorkspaceId('archive');
    expect(first.getWorkspaceId()).toBe('personal');
    expect(second.getWorkspaceId()).toBe('archive');
  });
});

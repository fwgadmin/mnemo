import { describe, expect, it } from 'vitest';
import { FileCapabilityStore, pathIsInside } from './fileCapabilities';

describe('FileCapabilityStore', () => {
  it('binds opaque capabilities to a renderer and expires them', () => {
    let now = 100;
    const store = new FileCapabilityStore(50, () => now);
    const capability = store.grant('/tmp/note.md', 7);
    expect(capability).not.toContain('note.md');
    expect(store.resolve(capability, 8)).toBeNull();
    expect(store.resolve(capability, 7)).toContain('note.md');
    now = 151;
    expect(store.resolve(capability, 7)).toBeNull();
  });

  it('rejects sibling paths when checking a workspace root', () => {
    expect(pathIsInside('/vault/project', '/vault/project/note.md')).toBe(true);
    expect(pathIsInside('/vault/project', '/vault/project-two/note.md')).toBe(false);
  });
});

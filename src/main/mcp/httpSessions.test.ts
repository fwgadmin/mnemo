import { describe, expect, it, vi } from 'vitest';
import { HttpSessionRegistry } from './httpSessions';

describe('HttpSessionRegistry', () => {
  it('enforces capacity and disposes idle sessions', async () => {
    let now = 0;
    const firstClose = vi.fn();
    const registry = new HttpSessionRegistry(1, 100, () => now);
    expect(registry.add('first', { close: firstClose })).toBe(true);
    expect(registry.add('second', { close: vi.fn() })).toBe(false);
    expect(registry.get('first')).toBeDefined();

    now = 101;
    registry.sweep();
    await Promise.resolve();
    expect(firstClose).toHaveBeenCalledOnce();
    expect(registry.size).toBe(0);
  });

  it('refreshes idle time on access and closes all resources', async () => {
    let now = 0;
    const close = vi.fn();
    const registry = new HttpSessionRegistry(2, 100, () => now);
    registry.add('one', { close });
    now = 90;
    expect(registry.get('one')).toBeDefined();
    now = 150;
    registry.sweep();
    expect(registry.size).toBe(1);
    await registry.closeAll();
    expect(close).toHaveBeenCalledOnce();
  });
});

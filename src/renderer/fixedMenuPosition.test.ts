// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { clampFixedContextMenu } from './fixedMenuPosition';

describe('fixed context-menu positioning', () => {
  it('keeps a menu at the requested point when it fits', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    expect(clampFixedContextMenu(100, 120, 200, 240)).toEqual({ left: 100, top: 120 });
  });

  it('flips above a bottom-edge invocation and clamps the right edge', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    expect(clampFixedContextMenu(950, 760, 200, 240)).toEqual({ left: 792, top: 520 });
  });
});

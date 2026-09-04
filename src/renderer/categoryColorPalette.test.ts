import { describe, expect, it } from 'vitest';
import type { ThemeDefinition } from './theme/themes';
import {
  buildEffectiveCategoryColors,
  contrastRatio,
  isReadableCategoryOnPanel,
} from './categoryColorPalette';

const theme: ThemeDefinition = {
  id: 'test-dark',
  name: 'Test dark',
  layout: 'ide',
  variables: {
    '--mnemo-bg-panel': '#111111',
    '--mnemo-accent': '#7c7cff',
  },
};

describe('category colors', () => {
  it('calculates known black/white contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 4);
  });

  it('creates readable child shades near an assigned parent color', () => {
    const colors = buildEffectiveCategoryColors(
      { Work: '#7c7cff' },
      theme,
      ['Work/Meetings', 'Work/Planning'],
      true,
    );
    expect(colors.Work).toBe('#7c7cff');
    expect(colors['Work/Meetings']).toMatch(/^#[0-9a-f]{6}$/);
    expect(colors['Work/Meetings']).not.toBe(colors.Work);
    expect(isReadableCategoryOnPanel(colors['Work/Meetings']!, '#111111')).toBe(true);
  });

  it('does not add automatic colors when disabled', () => {
    expect(buildEffectiveCategoryColors({}, theme, ['Work'], false)).toEqual({});
  });
});

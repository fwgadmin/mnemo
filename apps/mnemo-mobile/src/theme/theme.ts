import { useContext } from 'react';
import { useColorScheme, type ColorSchemeName } from 'react-native';
import { ThemePreferenceContext } from '../context/ThemePreferenceContext';

/**
 * Aligned with desktop [src/renderer/theme/themes.ts] — dark-default + light presets.
 * Radius matches --mnemo-radius (6px).
 */

export const UI_RADIUS = 6;

/** Body line height ≈ desktop CodeMirror markdown (1.7 × font size). */
export const BODY_FONT_SIZE = 16;
export const BODY_LINE_HEIGHT = Math.round(BODY_FONT_SIZE * 1.7);

export type Theme = {
  /** --mnemo-bg-app */
  background: string;
  /** --mnemo-bg-panel */
  surface: string;
  /** --mnemo-bg-panel-elevated */
  surfaceElevated: string;
  /** --mnemo-bg-active (selection, chip selected) */
  surfaceActive: string;
  /** --mnemo-category-bar (tab strip, subtle chrome) */
  categoryBar: string;
  /** --mnemo-text */
  text: string;
  /** --mnemo-text-muted */
  textMuted: string;
  /** --mnemo-text-dim */
  textDim: string;
  /** --mnemo-border */
  border: string;
  /** --mnemo-border-strong */
  borderStrong: string;
  /** --mnemo-accent */
  primary: string;
  /** --mnemo-on-accent */
  primaryText: string;
  danger: string;
  /** Note list rows: panel or elevated */
  card: string;
  chipBg: string;
  chipSelected: string;
  markdown: Record<string, unknown>;
};

/** Desktop `dark-default` / `ide-dark`. */
const dark: Theme = {
  background: '#0f0f0f',
  surface: '#111111',
  surfaceElevated: '#1a1a1a',
  surfaceActive: '#1a1a2e',
  categoryBar: '#141418',
  text: '#e4e4e7',
  textMuted: '#888888',
  textDim: '#555555',
  border: '#1e1e1e',
  borderStrong: '#333333',
  primary: '#7c7cff',
  primaryText: '#0a0a0a',
  danger: '#f87171',
  card: '#1a1a1a',
  chipBg: '#1a1a1a',
  chipSelected: '#1a1a2e',
  markdown: {
    body: { color: '#e4e4e7', fontSize: BODY_FONT_SIZE, lineHeight: BODY_LINE_HEIGHT },
    heading1: { color: '#7c7cff', fontSize: 26, fontWeight: '600' as const, marginBottom: 8 },
    heading2: { color: '#7c7cff', fontSize: 22, fontWeight: '600' as const, marginBottom: 6 },
    heading3: { color: '#7c7cff', fontSize: 18, fontWeight: '600' as const, marginBottom: 4 },
    link: { color: '#7c7cff', textDecorationLine: 'underline' as const },
    blockquote: {
      borderLeftColor: '#333333',
      borderLeftWidth: 4,
      paddingLeft: 12,
      color: '#888888',
    },
    code_inline: { backgroundColor: '#1a1a1a', color: '#e4e4e7', fontFamily: 'monospace', fontSize: 15 },
    fence: { backgroundColor: '#111111', color: '#e4e4e7', fontFamily: 'monospace', fontSize: 14 },
  },
};

/** Desktop `light`. */
const light: Theme = {
  background: '#f4f4f5',
  surface: '#ffffff',
  surfaceElevated: '#f4f4f5',
  surfaceActive: '#e0e7ff',
  categoryBar: '#e8e8ed',
  text: '#0a0a0b',
  textMuted: '#52525c',
  textDim: '#71717a',
  border: '#d4d4d8',
  borderStrong: '#a1a1aa',
  primary: '#4338ca',
  primaryText: '#ffffff',
  danger: '#dc2626',
  card: '#ffffff',
  chipBg: '#ececf2',
  chipSelected: '#e0e7ff',
  markdown: {
    body: { color: '#0a0a0b', fontSize: BODY_FONT_SIZE, lineHeight: BODY_LINE_HEIGHT },
    heading1: { color: '#4338ca', fontSize: 26, fontWeight: '600' as const, marginBottom: 8 },
    heading2: { color: '#4338ca', fontSize: 22, fontWeight: '600' as const, marginBottom: 6 },
    heading3: { color: '#4338ca', fontSize: 18, fontWeight: '600' as const, marginBottom: 4 },
    link: { color: '#4338ca', textDecorationLine: 'underline' as const },
    blockquote: {
      borderLeftColor: '#a1a1aa',
      borderLeftWidth: 4,
      paddingLeft: 12,
      color: '#52525c',
    },
    code_inline: {
      backgroundColor: '#f4f4f5',
      color: '#0a0a0b',
      fontFamily: 'monospace',
      fontSize: 15,
    },
    fence: { backgroundColor: '#f4f4f5', color: '#0a0a0b', fontFamily: 'monospace', fontSize: 14 },
  },
};

export function getThemeForScheme(scheme: ColorSchemeName): Theme {
  return scheme === 'dark' ? dark : light;
}

export function useAppTheme(): Theme {
  const ctx = useContext(ThemePreferenceContext);
  const system = useColorScheme();
  const resolved = ctx?.resolvedScheme ?? (system === 'dark' ? 'dark' : 'light');
  return getThemeForScheme(resolved);
}

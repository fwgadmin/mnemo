import { useColorScheme } from 'react-native';

export type Theme = {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
  card: string;
  chipBg: string;
  chipSelected: string;
  markdown: Record<string, unknown>;
};

const light: Theme = {
  background: '#f6f7f9',
  surface: '#ffffff',
  text: '#1a1a1e',
  textMuted: '#5c5c66',
  border: '#e2e4e8',
  primary: '#2563eb',
  primaryText: '#ffffff',
  danger: '#dc2626',
  card: '#ffffff',
  chipBg: '#e8eaef',
  chipSelected: '#dbeafe',
  markdown: {
    body: { color: '#1a1a1e', fontSize: 16, lineHeight: 24 },
    heading1: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
    heading2: { fontSize: 22, fontWeight: '600', marginBottom: 6 },
    heading3: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
    link: { color: '#2563eb', textDecorationLine: 'underline' },
    blockquote: { borderLeftColor: '#cbd5e1', borderLeftWidth: 4, paddingLeft: 12, opacity: 0.9 },
    code_inline: { backgroundColor: '#f1f5f9', fontFamily: 'monospace', fontSize: 15 },
    fence: { backgroundColor: '#f1f5f9', fontFamily: 'monospace', fontSize: 14 },
  },
};

const dark: Theme = {
  background: '#0f1117',
  surface: '#181b26',
  text: '#e8e9ed',
  textMuted: '#9ca3af',
  border: '#2d3344',
  primary: '#3b82f6',
  primaryText: '#ffffff',
  danger: '#f87171',
  card: '#181b26',
  chipBg: '#272c3d',
  chipSelected: '#1e3a5f',
  markdown: {
    body: { color: '#e8e9ed', fontSize: 16, lineHeight: 24 },
    heading1: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
    heading2: { fontSize: 22, fontWeight: '600', marginBottom: 6 },
    heading3: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
    link: { color: '#60a5fa', textDecorationLine: 'underline' },
    blockquote: { borderLeftColor: '#475569', borderLeftWidth: 4, paddingLeft: 12, opacity: 0.95 },
    code_inline: { backgroundColor: '#272c3d', fontFamily: 'monospace', fontSize: 15 },
    fence: { backgroundColor: '#272c3d', fontFamily: 'monospace', fontSize: 14 },
  },
};

export function useAppTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

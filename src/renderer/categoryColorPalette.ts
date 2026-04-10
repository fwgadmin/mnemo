import { GENERAL_PATH, UNASSIGNED_PATH, categoryColorStorageKey } from './categoryPath';
import type { ThemeDefinition } from './theme/themes';

/** Minimum contrast for category label / stripe on panel (WCAG ~AA for UI components). */
const MIN_CONTRAST = 3;

function parseHexChannels(hex: string): [number, number, number] | null {
  const t = hex.trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (!m) return null;
  let s = m[1]!;
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  return [
    parseInt(s.slice(0, 2), 16) / 255,
    parseInt(s.slice(2, 4), 16) / 255,
    parseInt(s.slice(4, 6), 16) / 255,
  ];
}

function toHex6(r255: number, g255: number, b255: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r255)}${c(g255)}${c(b255)}`;
}

function linearize(u: number): number {
  return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(linearize) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two sRGB hex colors. */
export function contrastRatio(hexFg: string, hexBg: string): number {
  const a = parseHexChannels(hexFg);
  const b = parseHexChannels(hexBg);
  if (!a || !b) return 1;
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function isReadableCategoryOnPanel(hex: string, panelBg: string, minRatio = MIN_CONTRAST): boolean {
  if (!/^#[0-9A-Fa-f]{3,8}$/.test(hex)) return false;
  return contrastRatio(hex, panelBg) >= minRatio;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const p = parseHexChannels(hex);
  if (!p) return { h: 0, s: 0, l: 0.5 };
  const [r, g, b] = p;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0,
    gp = 0,
    bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return toHex6((rp + m) * 255, (gp + m) * 255, (bp + m) * 255);
}

function tweakForContrast(hex: string, panelBg: string, isDark: boolean): string {
  let { h, s, l } = hexToHsl(hex);
  for (let i = 0; i < 8; i++) {
    if (isReadableCategoryOnPanel(hslToHex(h, s, l), panelBg)) return hslToHex(h, s, l);
    l = isDark ? Math.min(0.92, l + 0.06) : Math.max(0.08, l - 0.05);
    s = Math.min(0.95, s + 0.05);
  }
  return isDark ? '#e4e4e7' : '#18181b';
}

/** Theme-aware swatches (accent-based hues) that read on the panel background. */
export function getSuggestedCategorySwatches(theme: ThemeDefinition): string[] {
  const panelBg = theme.variables['--mnemo-bg-panel'] ?? '#111111';
  const accent = theme.variables['--mnemo-accent'] ?? '#7c7cff';
  const p = parseHexChannels(panelBg);
  const isDark = p ? relativeLuminance(p) < 0.45 : true;
  const { h: h0, s: s0 } = hexToHsl(accent);
  const raw: string[] = [];
  const hueStep = 32;
  for (let i = 0; i < 10; i++) {
    const hue = (h0 + i * hueStep) % 360;
    let sat = Math.min(0.88, Math.max(0.42, s0 + (i % 3) * 0.06));
    let light = isDark ? 0.62 : 0.38;
    let hex = hslToHex(hue, sat, light);
    if (!isReadableCategoryOnPanel(hex, panelBg)) {
      light = isDark ? 0.72 : 0.3;
      hex = hslToHex(hue, sat, light);
    }
    if (!isReadableCategoryOnPanel(hex, panelBg)) {
      hex = tweakForContrast(hex, panelBg, isDark);
    }
    raw.push(hex);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out.slice(0, 8);
}

function hashPathKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickAutoColorForKey(
  key: string,
  swatches: string[],
  accentFallback: string,
  panelBg: string,
): string {
  const pBg = parseHexChannels(panelBg);
  const isDark = pBg ? relativeLuminance(pBg) < 0.45 : true;
  if (swatches.length === 0) {
    return isReadableCategoryOnPanel(accentFallback, panelBg)
      ? accentFallback
      : tweakForContrast(accentFallback, panelBg, isDark);
  }
  const i = hashPathKey(key) % swatches.length;
  return swatches[i]!;
}

/**
 * Merge user-stored colors with auto picks: any stored hex that fails contrast on the
 * panel is replaced. Keys without a stored color are omitted so `colorForCategoryPath`
 * can still inherit from a parent folder. `General` always gets a readable color so
 * the chain resolves for uncategorized notes.
 */
export function buildEffectiveCategoryColors(
  explicit: Record<string, string>,
  theme: ThemeDefinition,
): Record<string, string> {
  const panelBg = theme.variables['--mnemo-bg-panel'] ?? '#111111';
  const accentFallback = theme.variables['--mnemo-accent'] ?? '#7c7cff';
  const swatches = getSuggestedCategorySwatches(theme);

  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(explicit)) {
    if (isReadableCategoryOnPanel(v, panelBg)) merged[k] = v;
    else merged[k] = pickAutoColorForKey(k, swatches, accentFallback, panelBg);
  }

  const generalKey = categoryColorStorageKey(GENERAL_PATH);
  if (!merged[generalKey]) {
    const g = explicit[generalKey];
    if (g && isReadableCategoryOnPanel(g, panelBg)) merged[generalKey] = g;
    else merged[generalKey] = pickAutoColorForKey(generalKey, swatches, accentFallback, panelBg);
  }

  const unassignedKey = categoryColorStorageKey(UNASSIGNED_PATH);
  if (!merged[unassignedKey]) {
    const u = explicit[unassignedKey];
    if (u && isReadableCategoryOnPanel(u, panelBg)) merged[unassignedKey] = u;
    else merged[unassignedKey] = pickAutoColorForKey(unassignedKey, swatches, accentFallback, panelBg);
  }

  return merged;
}

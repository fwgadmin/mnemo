import { GENERAL_PATH, normalizePath, parentPath } from './categoryPath';

/** Resolve a display color for a category path: exact match, then walk up to parent folders. */
export function colorForCategoryPath(
  path: string,
  colors: Record<string, string>,
): string | undefined {
  const p = normalizePath(path) || GENERAL_PATH;
  let cur: string | null = p;
  while (cur) {
    const c = colors[cur];
    if (c && /^#[0-9A-Fa-f]{3,8}$/.test(c)) return c;
    if (cur === GENERAL_PATH) break;
    cur = parentPath(cur);
  }
  return undefined;
}

export function readCategoryColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem('mnemo.categoryColors');
    if (!raw) return {};
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof k === 'string' && typeof v === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(v)) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function readCategoryColorStamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem('mnemo.categoryColorStamps');
    if (!raw) return {};
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof k === 'string' && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

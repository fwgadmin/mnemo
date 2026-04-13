import { kvGetItem, kvSetItem } from './asyncStorageSafe';

const KEY = 'mnemo.categoryColors';

function sanitize(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === 'string' && typeof v === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(v)) {
      out[k] = v;
    }
  }
  return out;
}

export async function loadCategoryColorsFromStorage(): Promise<Record<string, string>> {
  try {
    const raw = await kvGetItem(KEY);
    if (!raw) return {};
    return sanitize(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export async function saveCategoryColorsToStorage(colors: Record<string, string>): Promise<void> {
  await kvSetItem(KEY, JSON.stringify(colors));
}

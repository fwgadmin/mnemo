import { kvGetItem, kvSetItem } from './asyncStorageSafe';

const KEY_THEME_MODE = 'mnemo_mobile_theme_mode';

export type ThemeMode = 'light' | 'dark' | 'system';

export async function loadThemeMode(): Promise<ThemeMode> {
  const v = await kvGetItem(KEY_THEME_MODE);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await kvSetItem(KEY_THEME_MODE, mode);
}

const KEY_CATEGORIES_VIEW = 'mnemo.categoriesViewMode';

export type CategoriesViewMode = 'tree' | 'flat';

export async function loadCategoriesViewMode(): Promise<CategoriesViewMode> {
  const v = await kvGetItem(KEY_CATEGORIES_VIEW);
  if (v === 'tree' || v === 'flat') return v;
  return 'tree';
}

export async function saveCategoriesViewMode(mode: CategoriesViewMode): Promise<void> {
  await kvSetItem(KEY_CATEGORIES_VIEW, mode);
}

import type { MnemoUiPreferences } from '../shared/types';
import { readCategoryColors } from './categoryColors';

function loadBool(key: string, def: boolean): boolean {
  const v = localStorage.getItem(`mnemo.${key}`);
  return v === null ? def : v === 'true';
}

function readThemeId(): string {
  return localStorage.getItem('mnemo.themeId') ?? 'dark-default';
}

function readLayoutOverride(): MnemoUiPreferences['layoutOverride'] {
  const v = localStorage.getItem('mnemo.layoutOverride');
  if (v === 'sidebar' || v === 'top' || v === 'ide') return v;
  return 'inherit';
}

function readIdeTabIds(): string[] {
  try {
    const raw = localStorage.getItem('mnemo.ideTabIds');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Snapshot current localStorage prefs (for bootstrapping ui-preferences.json). */
export function gatherLocalStoragePreferences(): MnemoUiPreferences {
  return {
    themeId: readThemeId(),
    layoutOverride: readLayoutOverride(),
    showSidebar: loadBool('showSidebar', true),
    showNoteHeader: loadBool('showNoteHeader', true),
    showLineNumbers: loadBool('showLineNumbers', true),
    showNoteRefs: loadBool('showNoteRefs', false),
    grouped: localStorage.getItem('mnemo.grouped') !== 'false',
    categoryScopeSubtree: localStorage.getItem('mnemo.categoryScopeSubtree') !== 'false',
    categoryColors: readCategoryColors(),
    ideTabIds: readIdeTabIds(),
  };
}

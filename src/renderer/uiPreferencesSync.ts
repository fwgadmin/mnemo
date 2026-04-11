import type { MnemoUiPreferences } from '../shared/types';
import { DEFAULT_THEME_ID } from './theme/themes';
import { readCategoryColors } from './categoryColors';

function loadBool(key: string, def: boolean): boolean {
  const v = localStorage.getItem(`mnemo.${key}`);
  return v === null ? def : v === 'true';
}

function readThemeId(): string {
  return localStorage.getItem('mnemo.themeId') ?? DEFAULT_THEME_ID;
}

function readLayoutOverride(): MnemoUiPreferences['layoutOverride'] {
  const v = localStorage.getItem('mnemo.layoutOverride');
  if (v === 'sidebar' || v === 'top' || v === 'ide') return v;
  return 'inherit';
}

function readIdeTabIds(): string[] | undefined {
  try {
    const raw = localStorage.getItem('mnemo.ideTabIds');
    if (!raw) return undefined;
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return undefined;
    return p.filter((x): x is string => typeof x === 'string');
  } catch {
    return undefined;
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

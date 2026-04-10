/**
 * UI preferences on disk — same file for Electron GUI, CLI, and MCP agents.
 * Default: ui-preferences.json next to config (MNEMO_HOME, XDG data, or legacy paths).
 * When the active store is TursoNoteStore, reads merge disk + cloud `app_kv.ui_preferences`;
 * writes update both the JSON file and `app_kv` so themes, category colors, Markdown overrides, etc. sync.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { INoteStore, MnemoUiPreferences } from '../shared/types';
import { TursoNoteStore } from './store/TursoNoteStore';
import { defaultLocalDataDir, legacyElectronUserDataDir } from './userConfig';

const UI_PREFS_KV_KEY = 'ui_preferences';

function candidateReadPaths(electronUserData?: string): string[] {
  const out: string[] = [];
  if (electronUserData) {
    out.push(path.join(electronUserData, 'ui-preferences.json'));
  }
  const home = process.env['MNEMO_HOME']?.trim();
  if (home) {
    out.push(path.join(path.resolve(home), 'ui-preferences.json'));
  }
  out.push(path.join(defaultLocalDataDir(), 'ui-preferences.json'));
  out.push(path.join(legacyElectronUserDataDir(), 'ui-preferences.json'));
  return out;
}

function resolveWritePath(electronUserData?: string): string {
  if (electronUserData) {
    return path.join(electronUserData, 'ui-preferences.json');
  }
  const home = process.env['MNEMO_HOME']?.trim();
  if (home) {
    return path.join(path.resolve(home), 'ui-preferences.json');
  }
  return path.join(defaultLocalDataDir(), 'ui-preferences.json');
}

function isLayoutOverride(v: unknown): v is MnemoUiPreferences['layoutOverride'] {
  return v === 'inherit' || v === 'sidebar' || v === 'top' || v === 'ide';
}

const MARKDOWN_VAR_PREFIXES = ['--mnemo-editor-', '--mnemo-syntax-'] as const;

function isAllowedMarkdownVarKey(k: string): boolean {
  return MARKDOWN_VAR_PREFIXES.some(p => k.startsWith(p));
}

function isSafeCssValue(v: string): boolean {
  const t = v.trim();
  if (t.length < 1 || t.length > 220) return false;
  if (/[<>&]/.test(t)) return false;
  if (/expression\s*\(/i.test(t)) return false;
  if (/javascript:/i.test(t)) return false;
  if (/@import/i.test(t)) return false;
  return true;
}

function sanitizeMarkdownVarMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof k !== 'string' || !isAllowedMarkdownVarKey(k)) continue;
    if (typeof v !== 'string' || !isSafeCssValue(v)) continue;
    out[k] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** IDE open-tab order; UUID note ids only */
function sanitizeIdeTabIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === 'string' && uuidRe.test(x)) out.push(x);
  }
  return out.length ? [...new Set(out)] : undefined;
}

function sanitizeMarkdownByTheme(raw: unknown): Record<string, Record<string, string>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: Record<string, Record<string, string>> = {};
  for (const [themeId, inner] of Object.entries(o)) {
    if (typeof themeId !== 'string' || !/^[\w-]+$/.test(themeId)) continue;
    const m = sanitizeMarkdownVarMap(inner);
    if (m) out[themeId] = m;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Strip invalid keys; keep forward-compatible unknown fields out of merged writes. */
export function sanitizePrefs(raw: unknown): MnemoUiPreferences {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: MnemoUiPreferences = {};

  if (typeof o.themeId === 'string') out.themeId = o.themeId;
  if (isLayoutOverride(o.layoutOverride)) out.layoutOverride = o.layoutOverride;
  if (typeof o.showSidebar === 'boolean') out.showSidebar = o.showSidebar;
  if (typeof o.showNoteHeader === 'boolean') out.showNoteHeader = o.showNoteHeader;
  if (typeof o.showLineNumbers === 'boolean') out.showLineNumbers = o.showLineNumbers;
  if (typeof o.showNoteRefs === 'boolean') out.showNoteRefs = o.showNoteRefs;
  if (typeof o.grouped === 'boolean') out.grouped = o.grouped;
  if (typeof o.categoryScopeSubtree === 'boolean') out.categoryScopeSubtree = o.categoryScopeSubtree;

  if (o.categoryColors && typeof o.categoryColors === 'object' && !Array.isArray(o.categoryColors)) {
    const cc: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.categoryColors)) {
      if (typeof k === 'string' && typeof v === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(v)) {
        cc[k] = v;
      }
    }
    out.categoryColors = cc;
  }

  const mg = sanitizeMarkdownVarMap(o.markdownGlobal);
  if (mg) out.markdownGlobal = mg;
  const mbt = sanitizeMarkdownByTheme(o.markdownByTheme);
  if (mbt) out.markdownByTheme = mbt;

  const tabIds = sanitizeIdeTabIds(o.ideTabIds);
  if (tabIds?.length) out.ideTabIds = tabIds;

  return out;
}

export function readUiPreferencesFromDisk(electronUserData?: string): MnemoUiPreferences {
  for (const p of candidateReadPaths(electronUserData)) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      return sanitizePrefs(JSON.parse(raw) as unknown);
    } catch {
      /* try next */
    }
  }
  return {};
}

export function mergePrefs(
  current: MnemoUiPreferences,
  incoming: Partial<MnemoUiPreferences>,
): MnemoUiPreferences {
  const {
    categoryColors: incomingCc,
    markdownGlobal: incomingMg,
    markdownByTheme: incomingMbt,
    ideTabIds: incomingIdeTabs,
    ...restIncoming
  } = incoming;
  const next: MnemoUiPreferences = { ...current, ...restIncoming };
  if (incomingCc && typeof incomingCc === 'object') {
    next.categoryColors = {
      ...current.categoryColors,
      ...incomingCc,
    };
  }
  if (incomingMg !== undefined) {
    const mergedRaw = {
      ...(current.markdownGlobal ?? {}),
      ...(typeof incomingMg === 'object' && incomingMg ? incomingMg : {}),
    };
    const cleaned = sanitizeMarkdownVarMap(mergedRaw);
    if (cleaned) next.markdownGlobal = cleaned;
    else delete next.markdownGlobal;
  }
  if (incomingMbt !== undefined && typeof incomingMbt === 'object') {
    next.markdownByTheme = { ...(current.markdownByTheme ?? {}) };
    for (const [tid, vars] of Object.entries(incomingMbt)) {
      if (typeof tid !== 'string' || !/^[\w-]+$/.test(tid)) continue;
      const mergedRaw = { ...(next.markdownByTheme[tid] ?? {}), ...(vars as Record<string, string>) };
      const cleaned = sanitizeMarkdownVarMap(mergedRaw);
      if (cleaned) next.markdownByTheme[tid] = cleaned;
      else delete next.markdownByTheme[tid];
    }
    if (!next.markdownByTheme || Object.keys(next.markdownByTheme).length === 0) delete next.markdownByTheme;
  }
  if (incomingIdeTabs !== undefined) {
    const cleaned = sanitizeIdeTabIds(incomingIdeTabs);
    if (cleaned?.length) next.ideTabIds = cleaned;
    else delete next.ideTabIds;
  }
  return next;
}

export function mergeAndWriteUiPreferences(
  partial: Partial<MnemoUiPreferences>,
  electronUserData?: string,
): MnemoUiPreferences {
  const current = readUiPreferencesFromDisk(electronUserData);
  const partialClean = sanitizePrefs(partial as unknown) as MnemoUiPreferences;
  const merged = mergePrefs(current, partialClean);
  const writePath = resolveWritePath(electronUserData);
  fs.mkdirSync(path.dirname(writePath), { recursive: true });
  fs.writeFileSync(writePath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

/** Merge disk + Turso (when connected); cloud values win on conflict. */
export async function readUiPreferencesMerged(
  store: INoteStore | null | undefined,
  electronUserData?: string,
): Promise<MnemoUiPreferences> {
  const disk = readUiPreferencesFromDisk(electronUserData);
  if (store instanceof TursoNoteStore) {
    try {
      const raw = await store.getKv(UI_PREFS_KV_KEY);
      if (raw) {
        const cloud = sanitizePrefs(JSON.parse(raw) as unknown);
        return mergePrefs(disk, cloud);
      }
    } catch {
      /* ignore */
    }
  }
  return disk;
}

/** Write ui-preferences.json and mirror full JSON to Turso when using cloud DB. */
export async function mergeAndWriteUiPreferencesAsync(
  partial: Partial<MnemoUiPreferences>,
  electronUserData?: string,
  store?: INoteStore | null,
): Promise<MnemoUiPreferences> {
  const current = await readUiPreferencesMerged(store, electronUserData);
  const partialClean = sanitizePrefs(partial as unknown) as MnemoUiPreferences;
  const merged = mergePrefs(current, partialClean);
  const writePath = resolveWritePath(electronUserData);
  fs.mkdirSync(path.dirname(writePath), { recursive: true });
  fs.writeFileSync(writePath, JSON.stringify(merged, null, 2), 'utf-8');
  if (store instanceof TursoNoteStore) {
    await store.setKv(UI_PREFS_KV_KEY, JSON.stringify(merged));
  }
  return merged;
}

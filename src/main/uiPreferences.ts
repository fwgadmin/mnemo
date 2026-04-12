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

function prefsKvKey(workspaceId?: string): string {
  if (!workspaceId || workspaceId === 'default') {
    return UI_PREFS_KV_KEY;
  }
  return `${UI_PREFS_KV_KEY}:${workspaceId}`;
}

function candidateReadPaths(electronUserData?: string, workspaceId?: string): string[] {
  const out: string[] = [];
  if (electronUserData) {
    if (workspaceId && workspaceId !== 'default') {
      out.push(path.join(electronUserData, `ui-preferences.${workspaceId}.json`));
    }
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

function resolveWritePath(electronUserData?: string, workspaceId?: string): string {
  if (electronUserData) {
    if (workspaceId && workspaceId !== 'default') {
      return path.join(electronUserData, `ui-preferences.${workspaceId}.json`);
    }
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

/** IDE open-tab order: vault UUIDs and `file:${encodeURIComponent(absPath)}` filesystem tabs */
function sanitizeIdeTabIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    if (uuidRe.test(x)) {
      out.push(x);
      continue;
    }
    if (x.startsWith('file:') && x.length < 16384) {
      try {
        decodeURIComponent(x.slice(5));
        out.push(x);
      } catch {
        /* skip */
      }
    }
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

  if (o.categoryColorStamps && typeof o.categoryColorStamps === 'object' && !Array.isArray(o.categoryColorStamps)) {
    const st: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.categoryColorStamps)) {
      if (typeof k === 'string' && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e15) {
        st[k] = v;
      }
    }
    out.categoryColorStamps = st;
  }

  const mg = sanitizeMarkdownVarMap(o.markdownGlobal);
  if (mg) out.markdownGlobal = mg;
  const mbt = sanitizeMarkdownByTheme(o.markdownByTheme);
  if (mbt) out.markdownByTheme = mbt;

  // Include explicit [] so mergePrefs can clear persisted tabs; omitting the key would skip deletion.
  if ('ideTabIds' in o) {
    const tabIds = sanitizeIdeTabIds(o.ideTabIds);
    out.ideTabIds = tabIds?.length ? tabIds : [];
  }

  if (typeof o.workspaceFolder === 'string') {
    const w = o.workspaceFolder.trim();
    if (w.length > 0 && w.length <= 4096) out.workspaceFolder = w;
    else out.workspaceFolder = '';
  }

  return out;
}

function readFirstExistingPrefs(paths: string[]): MnemoUiPreferences {
  for (const p of paths) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      return sanitizePrefs(JSON.parse(raw) as unknown);
    } catch {
      /* try next */
    }
  }
  return {};
}

/**
 * Non-default workspaces: `candidateReadPaths` used to fall through to `ui-preferences.json`, which
 * re-applied the default vault's `ideTabIds` after a switch. Merge base defaults with
 * `ui-preferences.<workspaceId>.json` and never inherit `ideTabIds` from base unless the workspace
 * file explicitly lists them (so new vaults start with no IDE tabs).
 */
export function readUiPreferencesFromDisk(electronUserData?: string, workspaceId?: string): MnemoUiPreferences {
  if (!workspaceId || workspaceId === 'default') {
    for (const p of candidateReadPaths(electronUserData, workspaceId)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        return sanitizePrefs(JSON.parse(raw) as unknown);
      } catch {
        /* try next */
      }
    }
    return {};
  }

  if (electronUserData) {
    const base = readFirstExistingPrefs(candidateReadPaths(electronUserData, undefined));
    const wsPath = path.join(electronUserData, `ui-preferences.${workspaceId}.json`);
    let rawWs: unknown;
    try {
      rawWs = JSON.parse(fs.readFileSync(wsPath, 'utf-8'));
    } catch {
      const { ideTabIds: _omit, ...rest } = base;
      return rest;
    }
    const wsHasIdeTabKey = typeof rawWs === 'object' && rawWs !== null && 'ideTabIds' in rawWs;
    const wsSan = sanitizePrefs(rawWs);
    const merged = mergePrefs(base, wsSan);
    if (!wsHasIdeTabKey) {
      delete merged.ideTabIds;
    } else {
      const cleaned = sanitizeIdeTabIds((rawWs as { ideTabIds?: unknown }).ideTabIds);
      if (!cleaned?.length) delete merged.ideTabIds;
      else merged.ideTabIds = cleaned;
    }
    return merged;
  }

  for (const p of candidateReadPaths(electronUserData, workspaceId)) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      return sanitizePrefs(JSON.parse(raw) as unknown);
    } catch {
      /* try next */
    }
  }
  return {};
}

/** Last-write-wins per folder key when merging disk vs Turso (uses per-key timestamps). */
export function mergeCategoryColorDiskCloud(
  disk: MnemoUiPreferences,
  cloud: MnemoUiPreferences,
): Pick<MnemoUiPreferences, 'categoryColors' | 'categoryColorStamps'> {
  const dc = disk.categoryColors ?? {};
  const cc = cloud.categoryColors ?? {};
  const ds = disk.categoryColorStamps ?? {};
  const cs = cloud.categoryColorStamps ?? {};
  const keys = new Set([
    ...Object.keys(dc),
    ...Object.keys(cc),
    ...Object.keys(ds),
    ...Object.keys(cs),
  ]);
  const outColors: Record<string, string> = {};
  const outStamps: Record<string, number> = {};
  for (const k of keys) {
    const hasD = Object.prototype.hasOwnProperty.call(dc, k);
    const hasC = Object.prototype.hasOwnProperty.call(cc, k);
    const sd = ds[k] ?? (hasD ? 1 : 0);
    const sc = cs[k] ?? (hasC ? 1 : 0);
    if (sd > sc) {
      if (dc[k]) outColors[k] = dc[k]!;
      outStamps[k] = sd;
    } else if (sc > sd) {
      if (cc[k]) outColors[k] = cc[k]!;
      outStamps[k] = sc;
    } else {
      if (cc[k]) outColors[k] = cc[k]!;
      outStamps[k] = Math.max(sd, sc);
    }
  }
  return {
    categoryColors: Object.keys(outColors).length ? outColors : undefined,
    categoryColorStamps: Object.keys(outStamps).length ? outStamps : undefined,
  };
}

export function mergePrefs(
  current: MnemoUiPreferences,
  incoming: Partial<MnemoUiPreferences>,
): MnemoUiPreferences {
  const {
    categoryColors: incomingCc,
    categoryColorStamps: incomingStamps,
    workspaceFolder: incomingWs,
    markdownGlobal: incomingMg,
    markdownByTheme: incomingMbt,
    ideTabIds: incomingIdeTabs,
    ...restIncoming
  } = incoming;
  const next: MnemoUiPreferences = { ...current, ...restIncoming };
  /** Full replace: merged maps must not resurrect deleted keys (e.g. cleared folder colors). */
  if (incomingCc !== undefined) {
    if (incomingCc && typeof incomingCc === 'object' && !Array.isArray(incomingCc)) {
      next.categoryColors = { ...incomingCc };
    } else {
      delete next.categoryColors;
    }
  }
  if (incomingStamps !== undefined) {
    if (incomingStamps && typeof incomingStamps === 'object' && !Array.isArray(incomingStamps)) {
      next.categoryColorStamps = { ...incomingStamps };
    } else {
      delete next.categoryColorStamps;
    }
  }
  if (incomingWs !== undefined) {
    const w = typeof incomingWs === 'string' ? incomingWs.trim() : '';
    if (w.length > 0) next.workspaceFolder = w;
    else delete next.workspaceFolder;
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
  workspaceId?: string,
): MnemoUiPreferences {
  const current = readUiPreferencesFromDisk(electronUserData, workspaceId);
  const partialClean = sanitizePrefs(partial as unknown) as MnemoUiPreferences;
  const merged = mergePrefs(current, partialClean);
  const writePath = resolveWritePath(electronUserData, workspaceId);
  fs.mkdirSync(path.dirname(writePath), { recursive: true });
  fs.writeFileSync(writePath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

/** Merge disk + Turso (when connected); cloud values win on conflict. */
export async function readUiPreferencesMerged(
  store: INoteStore | null | undefined,
  electronUserData?: string,
  workspaceId?: string,
): Promise<MnemoUiPreferences> {
  const disk = readUiPreferencesFromDisk(electronUserData, workspaceId);
  if (store instanceof TursoNoteStore) {
    try {
      const raw = await store.getKv(prefsKvKey(workspaceId));
      if (raw) {
        const cloud = sanitizePrefs(JSON.parse(raw) as unknown);
        const merged = mergePrefs(disk, cloud);
        const cc = mergeCategoryColorDiskCloud(disk, cloud);
        return {
          ...merged,
          categoryColors: cc.categoryColors,
          categoryColorStamps: cc.categoryColorStamps,
        };
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
  workspaceId?: string,
): Promise<MnemoUiPreferences> {
  const current = await readUiPreferencesMerged(store, electronUserData, workspaceId);
  const partialClean = sanitizePrefs(partial as unknown) as MnemoUiPreferences;
  const merged = mergePrefs(current, partialClean);
  const writePath = resolveWritePath(electronUserData, workspaceId);
  fs.mkdirSync(path.dirname(writePath), { recursive: true });
  fs.writeFileSync(writePath, JSON.stringify(merged, null, 2), 'utf-8');
  if (store instanceof TursoNoteStore) {
    await store.setKv(prefsKvKey(workspaceId), JSON.stringify(merged));
  }
  return merged;
}

/**
 * UI preferences on disk — same file for Electron GUI, CLI, and MCP agents.
 * Default: ui-preferences.json next to config (MNEMO_HOME, XDG data, or legacy paths).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { MnemoUiPreferences } from '../shared/types';
import { defaultLocalDataDir, legacyElectronUserDataDir } from './userConfig';

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

  if (Array.isArray(o.ideTabIds)) {
    const ids = o.ideTabIds.filter((x): x is string => typeof x === 'string');
    if (ids.length) out.ideTabIds = ids;
  }

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
  const next: MnemoUiPreferences = { ...current, ...incoming };
  if (incoming.categoryColors && typeof incoming.categoryColors === 'object') {
    next.categoryColors = {
      ...current.categoryColors,
      ...incoming.categoryColors,
    };
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

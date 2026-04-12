/**
 * Workspace profiles: list + active id + optional per-workspace storage overrides.
 * Default `inherit` uses one global DB with `tenant_id === workspace id`.
 */
import type { App } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { WorkspaceProfileEntry, WorkspaceProfilesState, WorkspaceStorage } from '../shared/types';
import { syncWorkspaceFolder, type WorkspaceSyncResult } from './workspaceImport';
import { mergeAndWriteUiPreferencesAsync } from './uiPreferences';
import { getRemoteLibsqlCredentials, readAppConfigFile, resolveWorkspaceBootstrapRoot } from './userConfig';
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';

export const DEFAULT_WORKSPACE_ID = 'default';

let bootstrapRootCache = '';

export function getElectronBootstrapRoot(): string {
  return bootstrapRootCache;
}

function profilesPath(root: string): string {
  return path.join(root, 'workspace-profiles.json');
}

function defaultProfiles(): WorkspaceProfilesState {
  return {
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaces: [{ id: DEFAULT_WORKSPACE_ID, name: 'Default', storage: { mode: 'inherit' } }],
  };
}

function parseStorage(e: Record<string, unknown>): WorkspaceStorage | undefined {
  const raw = e['storage'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const mode = o['mode'];
  if (mode === 'inherit') return { mode: 'inherit' };
  if (mode === 'sqlite') {
    const dbPath = o['dbPath'];
    const vaultPath = o['vaultPath'];
    if (typeof dbPath === 'string' && typeof vaultPath === 'string') {
      return { mode: 'sqlite', dbPath, vaultPath };
    }
  }
  if (mode === 'remote') {
    return {
      mode: 'remote',
      tursoUrl: typeof o['tursoUrl'] === 'string' ? o['tursoUrl'] : undefined,
      tursoToken: typeof o['tursoToken'] === 'string' ? o['tursoToken'] : undefined,
      libsqlUrl: typeof o['libsqlUrl'] === 'string' ? o['libsqlUrl'] : undefined,
      libsqlAuthToken: typeof o['libsqlAuthToken'] === 'string' ? o['libsqlAuthToken'] : undefined,
    };
  }
  return undefined;
}

export function readWorkspaceProfilesFile(root: string): WorkspaceProfilesState {
  const p = profilesPath(root);
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return defaultProfiles();
    const o = j as Record<string, unknown>;
    const active =
      typeof o.activeWorkspaceId === 'string' && o.activeWorkspaceId.trim().length > 0
        ? o.activeWorkspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const wsRaw = o.workspaces;
    const workspaces: WorkspaceProfilesState['workspaces'] = [];
    if (Array.isArray(wsRaw)) {
      for (const x of wsRaw) {
        if (!x || typeof x !== 'object') continue;
        const e = x as Record<string, unknown>;
        const id = typeof e.id === 'string' ? e.id.trim() : '';
        const name = typeof e.name === 'string' ? e.name.trim() : '';
        if (id && /^[\w-]+$/.test(id) && id.length <= 64 && name.length <= 128) {
          const storage = parseStorage(e);
          workspaces.push({
            id,
            name: name || id,
            ...(storage ? { storage } : {}),
          });
        }
      }
    }
    if (!workspaces.some(w => w.id === DEFAULT_WORKSPACE_ID)) {
      workspaces.unshift({ id: DEFAULT_WORKSPACE_ID, name: 'Default', storage: { mode: 'inherit' } });
    }
    if (!workspaces.some(w => w.id === active)) {
      return defaultProfiles();
    }
    return { activeWorkspaceId: active, workspaces };
  } catch {
    return defaultProfiles();
  }
}

export function writeWorkspaceProfilesFile(root: string, data: WorkspaceProfilesState): void {
  const p = profilesPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

export function ensureWorkspaceProfilesOnDisk(root: string): WorkspaceProfilesState {
  const p = profilesPath(root);
  if (!fs.existsSync(p)) {
    const d = defaultProfiles();
    writeWorkspaceProfilesFile(root, d);
    return d;
  }
  return readWorkspaceProfilesFile(root);
}

function moveIfExists(src: string, destDir: string): void {
  if (!fs.existsSync(src)) return;
  const base = path.basename(src);
  const dest = path.join(destDir, base);
  if (fs.existsSync(dest)) return;
  fs.renameSync(src, dest);
}

/**
 * If the legacy flat layout has data, move it into `workspaces/default/`.
 */
export function migrateLegacyFlatWorkspace(root: string): void {
  const legacyDb = path.join(root, 'mnemo.db');
  const defaultDir = path.join(root, 'workspaces', DEFAULT_WORKSPACE_ID);
  const nestedDb = path.join(defaultDir, 'mnemo.db');
  if (!fs.existsSync(legacyDb) || fs.existsSync(nestedDb)) return;
  fs.mkdirSync(defaultDir, { recursive: true });
  for (const name of ['mnemo.db', 'ui-preferences.json', 'config.json']) {
    moveIfExists(path.join(root, name), defaultDir);
  }
  const legacyVault = path.join(root, 'vault');
  if (fs.existsSync(legacyVault)) {
    const destVault = path.join(defaultDir, 'vault');
    if (!fs.existsSync(destVault)) {
      fs.renameSync(legacyVault, destVault);
    }
  }
}

/**
 * Sets bootstrap root to Electron userData (no per-workspace userData redirect).
 * Copies remote config from legacy nested default path when needed.
 */
export function applyBootstrapRootOnly(
  app: App,
  configHasRemoteCredentials: (cfg: import('../shared/types').AppConfig) => boolean,
): void {
  bootstrapRootCache = app.getPath('userData');

  const tryReadConfig = (p: string): import('../shared/types').AppConfig => {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as import('../shared/types').AppConfig;
    } catch {
      return {};
    }
  };

  const flatCfg = path.join(bootstrapRootCache, 'config.json');
  const nestedDefaultCfg = path.join(
    bootstrapRootCache,
    'workspaces',
    DEFAULT_WORKSPACE_ID,
    'config.json',
  );
  let cfg = tryReadConfig(flatCfg);
  if (!configHasRemoteCredentials(cfg) && fs.existsSync(nestedDefaultCfg)) {
    cfg = tryReadConfig(nestedDefaultCfg);
  }

  if (configHasRemoteCredentials(cfg)) {
    if (!fs.existsSync(flatCfg) && fs.existsSync(nestedDefaultCfg)) {
      try {
        fs.mkdirSync(path.dirname(flatCfg), { recursive: true });
        fs.copyFileSync(nestedDefaultCfg, flatCfg);
      } catch {
        /* ignore */
      }
    }
  }
}

export function listWorkspaceProfiles(root: string): WorkspaceProfilesState {
  return ensureWorkspaceProfilesOnDisk(root);
}

export function createWorkspaceProfile(
  root: string,
  name: string,
  storage?: WorkspaceStorage,
): { state: WorkspaceProfilesState; newId: string } {
  const cur = ensureWorkspaceProfilesOnDisk(root);
  const id = `ws-${Date.now().toString(36)}`;
  const trimmed = name.trim().slice(0, 128) || id;
  const entry = {
    id,
    name: trimmed,
    storage: storage ?? ({ mode: 'inherit' } satisfies WorkspaceStorage),
  };
  const next: WorkspaceProfilesState = {
    ...cur,
    workspaces: [...cur.workspaces, entry],
  };
  writeWorkspaceProfilesFile(root, next);
  return { state: next, newId: id };
}

/**
 * Import markdown from a directory into a workspace (global store + tenant_id = workspaceId).
 */
export async function importFolderIntoWorkspaceProfile(
  bootstrapRoot: string,
  workspaceId: string,
  importRootAbs: string,
  store: import('../shared/types').INoteStore,
): Promise<WorkspaceSyncResult> {
  const mapPath = path.join(bootstrapRoot, `workspace-import-map.${workspaceId}.json`);
  const resolved = path.resolve(importRootAbs);
  const stats = await syncWorkspaceFolder(store, resolved, mapPath, workspaceId);
  await mergeAndWriteUiPreferencesAsync(
    { workspaceFolder: resolved },
    bootstrapRoot,
    store,
    workspaceId,
  );
  return stats;
}

export function setActiveWorkspace(root: string, id: string): WorkspaceProfilesState | null {
  const cur = ensureWorkspaceProfilesOnDisk(root);
  if (!cur.workspaces.some(w => w.id === id)) return null;
  const next = { ...cur, activeWorkspaceId: id };
  writeWorkspaceProfilesFile(root, next);
  return next;
}

/** Update per-workspace storage (Settings). Caller may close dedicated store cache before/after. */
export function setWorkspaceProfileStorage(
  root: string,
  id: string,
  storage: WorkspaceStorage,
): WorkspaceProfilesState | null {
  const cur = ensureWorkspaceProfilesOnDisk(root);
  if (!cur.workspaces.some(w => w.id === id)) return null;
  const next: WorkspaceProfilesState = {
    ...cur,
    workspaces: cur.workspaces.map(w => (w.id === id ? { ...w, storage } : w)),
  };
  writeWorkspaceProfilesFile(root, next);
  return next;
}

/** Remove profile entry (not active, not default). Caller purges tenant data / dedicated DB files. */
export function archiveWorkspaceProfile(root: string, id: string): { state: WorkspaceProfilesState } | null {
  if (id === DEFAULT_WORKSPACE_ID) return null;
  const cur = ensureWorkspaceProfilesOnDisk(root);
  if (cur.activeWorkspaceId === id) return null;
  if (cur.workspaces.length <= 1) return null;
  if (!cur.workspaces.some(w => w.id === id)) return null;
  const next: WorkspaceProfilesState = {
    ...cur,
    workspaces: cur.workspaces.filter(w => w.id !== id),
  };
  writeWorkspaceProfilesFile(root, next);
  return { state: next };
}

/** Remove profile entry (not active, not default). Caller purges tenant data / dedicated DB files. */
export function deleteWorkspaceProfile(root: string, id: string): { state: WorkspaceProfilesState } | null {
  if (id === DEFAULT_WORKSPACE_ID) return null;
  const cur = ensureWorkspaceProfilesOnDisk(root);
  if (cur.activeWorkspaceId === id) return null;
  if (cur.workspaces.length <= 1) return null;
  if (!cur.workspaces.some(w => w.id === id)) return null;
  const next: WorkspaceProfilesState = {
    ...cur,
    workspaces: cur.workspaces.filter(w => w.id !== id),
  };
  writeWorkspaceProfilesFile(root, next);
  return { state: next };
}

/**
 * Local SQLite paths for CLI when `--db` is omitted: single bootstrap `mnemo.db` (inherit workspaces).
 */
export function getLocalWorkspaceDbPathsForCli(): { dbPath: string; vaultPath: string } {
  const root = resolveWorkspaceBootstrapRoot();
  fs.mkdirSync(root, { recursive: true });
  return {
    dbPath: path.join(root, 'mnemo.db'),
    vaultPath: path.join(root, 'vault'),
  };
}

/** Purge notes for a workspace (CLI archive/delete, or resolver fallback). Inherit: global DB + tenant id; remote: dedicated Turso + default tenant. */
export async function purgeWorkspaceTenantData(root: string, entry: WorkspaceProfileEntry): Promise<void> {
  const st = entry.storage ?? { mode: 'inherit' };
  if (st.mode === 'sqlite') return;
  if (st.mode === 'inherit') {
    const cfg = readAppConfigFile();
    const { url, token } = getRemoteLibsqlCredentials(cfg);
    if (url?.trim() && token?.trim()) {
      const turso = new TursoNoteStore(url, token, path.join(root, 'vault'));
      await turso.initSchema();
      await turso.purgeTenantNotes(entry.id);
      turso.close();
    } else {
      const dbPath = path.join(root, 'mnemo.db');
      const vaultPath = path.join(root, 'vault');
      const local = new LocalNoteStore(dbPath, vaultPath);
      await local.purgeTenantNotes(entry.id);
      local.close();
    }
    return;
  }
  const url = (st.tursoUrl || st.libsqlUrl || '').trim();
  const token = (st.tursoToken || st.libsqlAuthToken || '').trim();
  if (!url || !token) return;
  const turso = new TursoNoteStore(url, token, path.join(root, 'vault'));
  await turso.initSchema();
  await turso.purgeTenantNotes('default');
  turso.close();
}

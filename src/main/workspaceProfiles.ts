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

type SecretCodec = (value: string) => string;
let protectWorkspaceSecret: SecretCodec = (value) => value;
let unprotectWorkspaceSecret: SecretCodec = (value) => value;

/** Electron installs an OS-backed codec; CLI/MCP retain plaintext compatibility with private file modes. */
export function setWorkspaceSecretCodec(codec: { protect: SecretCodec; unprotect: SecretCodec }): void {
  protectWorkspaceSecret = codec.protect;
  unprotectWorkspaceSecret = codec.unprotect;
}

export function getElectronBootstrapRoot(): string {
  return bootstrapRootCache;
}

export function workspaceProfilesFilePath(root: string): string {
  return path.join(root, 'workspace-profiles.json');
}

function profilesPath(root: string): string {
  return workspaceProfilesFilePath(root);
}

function defaultProfiles(): WorkspaceProfilesState {
  return {
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaces: [
      {
        id: DEFAULT_WORKSPACE_ID,
        name: 'Default',
        storage: { mode: 'inherit' },
      },
    ],
    deletedWorkspaceIds: [],
  };
}

const MAX_DELETED_WORKSPACE_IDS = 512;

function isValidWorkspaceIdToken(id: string): boolean {
  return id.length > 0 && id.length <= 64 && /^[\w-]+$/.test(id);
}

/** Parse + dedupe tombstones (default is never stored). */
export function normalizeDeletedWorkspaceIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const id = x.trim();
    if (!isValidWorkspaceIdToken(id) || id === DEFAULT_WORKSPACE_ID) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_DELETED_WORKSPACE_IDS) break;
  }
  return out;
}

function tombstoneWorkspaceId(state: WorkspaceProfilesState, id: string): string[] {
  if (id === DEFAULT_WORKSPACE_ID) return state.deletedWorkspaceIds ?? [];
  const next = normalizeDeletedWorkspaceIds([...(state.deletedWorkspaceIds ?? []), id]);
  return next;
}

export function defaultWorkspaceProfilesState(): WorkspaceProfilesState {
  return defaultProfiles();
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
      tursoToken: typeof o['tursoToken'] === 'string' ? unprotectWorkspaceSecret(o['tursoToken']) : undefined,
      libsqlUrl: typeof o['libsqlUrl'] === 'string' ? o['libsqlUrl'] : undefined,
      libsqlAuthToken:
        typeof o['libsqlAuthToken'] === 'string' ? unprotectWorkspaceSecret(o['libsqlAuthToken']) : undefined,
    };
  }
  return undefined;
}

/** Parse a storage JSON object (CLI `--json`, MCP). Same validation as profile `storage` fields. */
export function parseWorkspaceStorageRoot(j: unknown): WorkspaceStorage | undefined {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return undefined;
  return parseStorage({ storage: j } as Record<string, unknown>);
}

/** KV / remote JSON: workspace rows + optional deletion tombstones. */
export function parseWorkspaceProfilesKvPayload(j: unknown): {
  workspaces: WorkspaceProfilesState['workspaces'];
  deletedWorkspaceIds: string[];
} {
  const workspaces = parseWorkspaceProfilesWorkspacesOnly(j);
  let deletedWorkspaceIds: string[] = [];
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    deletedWorkspaceIds = normalizeDeletedWorkspaceIds((j as Record<string, unknown>).deletedWorkspaceIds);
  }
  return { workspaces, deletedWorkspaceIds };
}

/**
 * Workspace list + storage only (Turso app_kv). Does not include activeWorkspaceId — that stays on each device.
 */
export function parseWorkspaceProfilesWorkspacesOnly(j: unknown): WorkspaceProfilesState['workspaces'] {
  if (!j || typeof j !== 'object') return defaultProfiles().workspaces;
  const o = j as Record<string, unknown>;
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
        const archivedRaw = typeof e.archivedAt === 'string' ? e.archivedAt.trim() : '';
        const archivedAt =
          id !== DEFAULT_WORKSPACE_ID && archivedRaw && !Number.isNaN(Date.parse(archivedRaw))
            ? archivedRaw
            : undefined;
        workspaces.push({
          id,
          name: name || id,
          ...(storage ? { storage } : {}),
          ...(archivedAt ? { archivedAt } : {}),
        });
      }
    }
  }
  if (!workspaces.some((w) => w.id === DEFAULT_WORKSPACE_ID)) {
    workspaces.unshift({
      id: DEFAULT_WORKSPACE_ID,
      name: 'Default',
      storage: { mode: 'inherit' },
    });
  }
  if (workspaces.length === 0) return defaultProfiles().workspaces;
  return workspaces;
}

/** Pick a valid active id for this device given a workspace list (used when merging remote list with local selection). */
export function combineLocalActiveWithWorkspaces(
  localActive: string,
  workspaces: WorkspaceProfilesState['workspaces'],
): WorkspaceProfilesState {
  const active = workspaces.some((w) => w.id === localActive && !w.archivedAt) ? localActive : DEFAULT_WORKSPACE_ID;
  return { activeWorkspaceId: active, workspaces };
}

/** JSON stored in Turso app_kv — workspace definitions + tombstones; never activeWorkspaceId. */
export function workspaceProfilesRemotePayload(state: WorkspaceProfilesState): {
  workspaces: WorkspaceProfilesState['workspaces'];
  deletedWorkspaceIds: string[];
} {
  return {
    workspaces: state.workspaces.map((workspace) => {
      const storage = workspace.storage;
      if (storage?.mode !== 'remote') return workspace;
      return {
        ...workspace,
        storage: {
          mode: 'remote' as const,
          tursoUrl: storage.tursoUrl,
          libsqlUrl: storage.libsqlUrl,
        },
      };
    }),
    deletedWorkspaceIds: normalizeDeletedWorkspaceIds(state.deletedWorkspaceIds),
  };
}

export function mergeDeletedWorkspaceIds(a: string[] | undefined, b: string[] | undefined): string[] {
  return normalizeDeletedWorkspaceIds([...(a ?? []), ...(b ?? [])]);
}

export function filterWorkspacesByDeletedIds(
  workspaces: WorkspaceProfileEntry[],
  deletedIds: Set<string>,
): WorkspaceProfileEntry[] {
  return workspaces.filter((w) => w.id === DEFAULT_WORKSPACE_ID || !deletedIds.has(w.id));
}

/** True when a profile's name is only its id (what tenant repair writes when the real name is unknown). */
export function hasPlaceholderName(w: WorkspaceProfileEntry): boolean {
  return w.id !== DEFAULT_WORKSPACE_ID && w.name.trim() === w.id;
}

/** Fill placeholder names in `primary` from real names for the same id in `other`. */
export function restoreWorkspaceNames(
  primary: WorkspaceProfileEntry[],
  other: WorkspaceProfileEntry[],
): WorkspaceProfileEntry[] {
  const named = new Map(other.filter((w) => !hasPlaceholderName(w)).map((w) => [w.id, w.name] as const));
  return primary.map((w) => (hasPlaceholderName(w) && named.has(w.id) ? { ...w, name: named.get(w.id)! } : w));
}

/**
 * `primary` wins field-by-field; placeholder names are filled from `other`, and profiles only `other`
 * has are appended. Callers filter tombstoned ids.
 */
export function mergeWorkspacesPreferring(
  primary: WorkspaceProfileEntry[],
  other: WorkspaceProfileEntry[],
): WorkspaceProfileEntry[] {
  const ids = new Set(primary.map((w) => w.id));
  return [...restoreWorkspaceNames(primary, other), ...other.filter((w) => !ids.has(w.id))];
}

/**
 * When Turso app_kv is newer than disk: cloud entries win field-by-field, except that a placeholder
 * name (the id) never replaces a real one. Entries only on this device are kept; the caller filters
 * tombstoned ids.
 */
export function mergeWorkspacesWhenCloudNewer(
  diskWorkspaces: WorkspaceProfileEntry[],
  cloudWorkspaces: WorkspaceProfileEntry[],
): WorkspaceProfileEntry[] {
  const cloudById = new Map(cloudWorkspaces.map((w) => [w.id, w] as const));
  const diskById = new Map(diskWorkspaces.map((w) => [w.id, w] as const));
  const out: WorkspaceProfileEntry[] = restoreWorkspaceNames(cloudWorkspaces, diskWorkspaces).map((w) => {
    const local = diskById.get(w.id);
    if (w.storage?.mode === 'remote' && local?.storage?.mode === 'remote') {
      return {
        ...w,
        storage: {
          ...w.storage,
          tursoToken: w.storage.tursoToken || local.storage.tursoToken,
          libsqlAuthToken: w.storage.libsqlAuthToken || local.storage.libsqlAuthToken,
        },
      };
    }
    return { ...w };
  });
  // Keep profiles this device knows about that the cloud copy lacks. Deletions are tombstoned (and
  // filtered by the caller), so a missing row means a stale or truncated cloud copy, not a removal.
  for (const w of diskWorkspaces) {
    if (!cloudById.has(w.id)) out.push({ ...w });
  }
  const seen = new Map<string, WorkspaceProfileEntry>();
  for (const w of out) {
    if (!seen.has(w.id)) seen.set(w.id, w);
  }
  const merged = [...seen.values()];
  if (!merged.some((w) => w.id === DEFAULT_WORKSPACE_ID)) {
    merged.unshift({
      id: DEFAULT_WORKSPACE_ID,
      name: 'Default',
      storage: { mode: 'inherit' },
    });
  }
  return merged;
}

/** Add inherit-mode profile rows for tenant_ids that have notes but no profile row (repair after bad sync). */
export function augmentWorkspacesWithTenantIdsFromDb(
  workspaces: WorkspaceProfilesState['workspaces'],
  tenantIds: string[],
  options?: { skipIds?: Set<string> },
): WorkspaceProfilesState['workspaces'] {
  const skip = options?.skipIds;
  const byId = new Map(workspaces.map((w) => [w.id, w] as const));
  for (const tid of tenantIds) {
    const t = tid.trim();
    if (!t || byId.has(t)) continue;
    if (skip?.has(t)) continue;
    byId.set(t, {
      id: t,
      name: t === DEFAULT_WORKSPACE_ID ? 'Default' : t,
      storage: { mode: 'inherit' },
    });
  }
  const out = [...byId.values()];
  if (!out.some((w) => w.id === DEFAULT_WORKSPACE_ID)) {
    out.unshift({
      id: DEFAULT_WORKSPACE_ID,
      name: 'Default',
      storage: { mode: 'inherit' },
    });
  }
  return out;
}

/** Parse workspace-profiles JSON on disk (includes per-device activeWorkspaceId). */
export function parseWorkspaceProfilesState(j: unknown): WorkspaceProfilesState {
  if (!j || typeof j !== 'object') return defaultProfiles();
  const o = j as Record<string, unknown>;
  const deletedWorkspaceIds = normalizeDeletedWorkspaceIds(o.deletedWorkspaceIds);
  const delSet = new Set(deletedWorkspaceIds);
  let workspaces = parseWorkspaceProfilesWorkspacesOnly(j);
  workspaces = filterWorkspacesByDeletedIds(workspaces, delSet);
  const activeRaw =
    typeof o.activeWorkspaceId === 'string' && o.activeWorkspaceId.trim().length > 0
      ? o.activeWorkspaceId.trim()
      : DEFAULT_WORKSPACE_ID;
  const active =
    workspaces.some((w) => w.id === activeRaw && !w.archivedAt) && !delSet.has(activeRaw)
      ? activeRaw
      : DEFAULT_WORKSPACE_ID;
  if (!workspaces.some((w) => w.id === active)) {
    return defaultProfiles();
  }
  return { activeWorkspaceId: active, workspaces, deletedWorkspaceIds };
}

export type WorkspaceProfilesFileStatus = 'ok' | 'missing' | 'unreadable';

/**
 * Read workspace-profiles.json and say whether it was actually read. A file that exists but does not
 * parse (for example caught mid-write by an older CLI/MCP build) is retried briefly, then reported as
 * `unreadable` so callers never persist the in-memory defaults over it — doing so used to wipe every
 * workspace name, after which tenant repair re-added the workspaces named by their ids.
 */
export function readWorkspaceProfilesFileResult(root: string): {
  state: WorkspaceProfilesState;
  status: WorkspaceProfilesFileStatus;
} {
  const p = profilesPath(root);
  for (let attempt = 0; attempt < 5; attempt++) {
    let raw: string;
    try {
      raw = fs.readFileSync(p, 'utf-8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { state: defaultProfiles(), status: 'missing' };
      raw = '';
    }
    try {
      const j = JSON.parse(raw) as unknown;
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        return { state: parseWorkspaceProfilesState(j), status: 'ok' };
      }
    } catch {
      /* retry: another process may be rewriting the file */
    }
    const until = Date.now() + 20;
    while (Date.now() < until) {
      /* short synchronous back-off */
    }
  }
  return { state: defaultProfiles(), status: 'unreadable' };
}

export function readWorkspaceProfilesFile(root: string): WorkspaceProfilesState {
  return readWorkspaceProfilesFileResult(root).state;
}

/** Disk only — use when rehydrating from Turso without double-mirroring. */
export function writeWorkspaceProfilesFileDiskOnly(root: string, data: WorkspaceProfilesState): void {
  const p = profilesPath(root);
  const stored: WorkspaceProfilesState = {
    ...data,
    workspaces: data.workspaces.map((workspace) => {
      const storage = workspace.storage;
      if (storage?.mode !== 'remote') return workspace;
      return {
        ...workspace,
        storage: {
          ...storage,
          tursoToken: storage.tursoToken ? protectWorkspaceSecret(storage.tursoToken) : undefined,
          libsqlAuthToken: storage.libsqlAuthToken ? protectWorkspaceSecret(storage.libsqlAuthToken) : undefined,
        },
      };
    }),
  };
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  // Write a temp file and rename it into place so concurrent readers (app, CLI, MCP servers) never
  // see a truncated file.
  const tmp = `${p}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(stored, null, 2), { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.chmodSync(tmp, 0o600);
    } catch {
      /* ignore unsupported permission bits */
    }
    fs.renameSync(tmp, p);
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    throw e;
  }
}

/** app_kv key — mirrored with workspace-profiles.json when using Turso (same DB as notes). */
export const WORKSPACE_PROFILES_KV_KEY = 'workspace_profiles';

/**
 * Merge into the cloud copy instead of replacing it: a device whose local file was missing or stale
 * must not erase names, profiles or deletion markers that only the cloud copy holds.
 */
async function mirrorMergedToKv(st: TursoNoteStore, data: WorkspaceProfilesState): Promise<void> {
  let next = data;
  try {
    const entry = await st.getKvEntry(WORKSPACE_PROFILES_KV_KEY);
    if (entry) {
      const cloud = parseWorkspaceProfilesKvPayload(JSON.parse(entry.value) as unknown);
      const deleted = mergeDeletedWorkspaceIds(data.deletedWorkspaceIds, cloud.deletedWorkspaceIds);
      next = {
        ...data,
        workspaces: filterWorkspacesByDeletedIds(
          mergeWorkspacesPreferring(data.workspaces, cloud.workspaces),
          new Set(deleted),
        ),
        deletedWorkspaceIds: deleted,
      };
    }
  } catch {
    /* unreadable cloud copy: overwrite it with ours */
  }
  try {
    await st.setKv(WORKSPACE_PROFILES_KV_KEY, JSON.stringify(workspaceProfilesRemotePayload(next)));
  } catch {
    /* offline: the next merged read pushes it */
  }
}

function mirrorWorkspaceProfilesToKv(data: WorkspaceProfilesState): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGlobalStore } = require('./storeResolver') as typeof import('./storeResolver');
    const st = getGlobalStore();
    if (st instanceof TursoNoteStore) void mirrorMergedToKv(st, data);
  } catch {
    /* ignore */
  }
}

/** Persist to disk and mirror to Turso app_kv when the global store is remote. */
export function writeWorkspaceProfilesFile(root: string, data: WorkspaceProfilesState): void {
  writeWorkspaceProfilesFileDiskOnly(root, data);
  mirrorWorkspaceProfilesToKv(data);
}

/**
 * Profiles for a read-modify-write. A missing file is created locally only (never mirrored: the cloud
 * copy may hold the real list). An unreadable file throws rather than being replaced by defaults.
 */
export function ensureWorkspaceProfilesOnDisk(root: string): WorkspaceProfilesState {
  const { state, status } = readWorkspaceProfilesFileResult(root);
  if (status === 'missing') {
    writeWorkspaceProfilesFileDiskOnly(root, state);
    return state;
  }
  if (status === 'unreadable') {
    throw new Error(`workspace-profiles.json in ${root} could not be read; not overwriting it`);
  }
  return state;
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
  const nestedDefaultCfg = path.join(bootstrapRootCache, 'workspaces', DEFAULT_WORKSPACE_ID, 'config.json');
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
    deletedWorkspaceIds: (cur.deletedWorkspaceIds ?? []).filter((x) => x !== id),
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
  await mergeAndWriteUiPreferencesAsync({ workspaceFolder: resolved }, bootstrapRoot, store, workspaceId);
  return stats;
}

export function setActiveWorkspace(root: string, id: string): WorkspaceProfilesState | null {
  const cur = ensureWorkspaceProfilesOnDisk(root);
  if (!cur.workspaces.some((w) => w.id === id && !w.archivedAt)) return null;
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
  if (!cur.workspaces.some((w) => w.id === id)) return null;
  const next: WorkspaceProfilesState = {
    ...cur,
    workspaces: cur.workspaces.map((w) => (w.id === id ? { ...w, storage } : w)),
  };
  writeWorkspaceProfilesFile(root, next);
  return next;
}

/** Rename a vault’s display label (including the default workspace; id stays `default`). */
export function renameWorkspaceProfile(root: string, id: string, name: string): WorkspaceProfilesState | null {
  const trimmed = name.trim().slice(0, 128);
  if (!trimmed) return null;
  const cur = ensureWorkspaceProfilesOnDisk(root);
  if (!cur.workspaces.some((w) => w.id === id)) return null;
  const next: WorkspaceProfilesState = {
    ...cur,
    workspaces: cur.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w)),
  };
  writeWorkspaceProfilesFile(root, next);
  return next;
}

/** Hide a profile from normal selection while retaining its metadata and all note/file data. */
export function archiveWorkspaceProfile(root: string, id: string): { state: WorkspaceProfilesState } | null {
  if (id === DEFAULT_WORKSPACE_ID) return null;
  const cur = ensureWorkspaceProfilesOnDisk(root);
  if (cur.activeWorkspaceId === id) return null;
  const entry = cur.workspaces.find((w) => w.id === id);
  if (!entry || entry.archivedAt) return null;
  if (cur.workspaces.filter((w) => !w.archivedAt).length <= 1) return null;
  const next: WorkspaceProfilesState = {
    ...cur,
    workspaces: cur.workspaces.map((w) => (w.id === id ? { ...w, archivedAt: new Date().toISOString() } : w)),
  };
  writeWorkspaceProfilesFile(root, next);
  return { state: next };
}

/** Make an archived workspace selectable again without changing its storage or data. */
export function restoreWorkspaceProfile(root: string, id: string): { state: WorkspaceProfilesState } | null {
  const cur = ensureWorkspaceProfilesOnDisk(root);
  const entry = cur.workspaces.find((w) => w.id === id);
  if (!entry?.archivedAt) return null;
  const next: WorkspaceProfilesState = {
    ...cur,
    workspaces: cur.workspaces.map((w) => {
      if (w.id !== id) return w;
      const { archivedAt: _archivedAt, ...restored } = w;
      return restored;
    }),
  };
  writeWorkspaceProfilesFile(root, next);
  return { state: next };
}

/** Permanently remove a profile. Caller purges tenant data / dedicated DB files. */
export function deleteWorkspaceProfile(root: string, id: string): { state: WorkspaceProfilesState } | null {
  if (id === DEFAULT_WORKSPACE_ID) return null;
  const cur = ensureWorkspaceProfilesOnDisk(root);
  if (cur.activeWorkspaceId === id) return null;
  if (cur.workspaces.length <= 1) return null;
  if (!cur.workspaces.some((w) => w.id === id)) return null;
  const next: WorkspaceProfilesState = {
    ...cur,
    workspaces: cur.workspaces.filter((w) => w.id !== id),
    deletedWorkspaceIds: tombstoneWorkspaceId(cur, id),
  };
  writeWorkspaceProfilesFile(root, next);
  return { state: next };
}

/**
 * Local SQLite paths for CLI when `--db` is omitted: single bootstrap `mnemo.db` (inherit workspaces).
 */
export function getLocalWorkspaceDbPathsForCli(): {
  dbPath: string;
  vaultPath: string;
} {
  const root = resolveWorkspaceBootstrapRoot();
  fs.mkdirSync(root, { recursive: true });
  return {
    dbPath: path.join(root, 'mnemo.db'),
    vaultPath: path.join(root, 'vault'),
  };
}

/** Purge notes for permanent workspace deletion. Inherit: global DB + tenant id; remote: dedicated Turso + default tenant. */
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

/**
 * After a profile row is permanently removed: purge tenant notes (inherit/remote) and dedicated SQLite files.
 * Archive must never call this helper.
 */
export async function applyWorkspaceRemovalDataPurge(root: string, entry: WorkspaceProfileEntry): Promise<void> {
  await purgeWorkspaceTenantData(root, entry);
  const st = entry.storage ?? { mode: 'inherit' };
  if (st.mode !== 'sqlite') return;
  try {
    fs.unlinkSync(st.dbPath);
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(st.vaultPath, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

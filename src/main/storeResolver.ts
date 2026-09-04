/**
 * Resolves the active INoteStore + tenantId for the current workspace (inherit vs dedicated DB).
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { INoteStore, WorkspaceProfileEntry, WorkspaceProfilesState } from '../shared/types';
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import { purgeWorkspaceTenantData, readWorkspaceProfilesFile } from './workspaceProfiles';

let globalStore: INoteStore | null = null;
let bootstrapRoot = '';
let activeWorkspaceId = 'default';

/** Dedicated stores keyed by workspace identity and credentials. */
const dedicatedStores = new Map<string, INoteStore>();

export function setStoreResolverBootstrapRoot(root: string): void {
  bootstrapRoot = root;
}

export function setGlobalStore(store: INoteStore | null): void {
  globalStore = store;
}

export function getGlobalStore(): INoteStore | null {
  return globalStore;
}

export function setActiveWorkspaceId(id: string): void {
  activeWorkspaceId = id;
}

export function getActiveWorkspaceId(): string {
  return activeWorkspaceId;
}

export function workspaceStorageCacheKey(w: WorkspaceProfileEntry): string {
  const s = w.storage ?? { mode: 'inherit' as const };
  if (s.mode === 'inherit') return 'global';
  if (s.mode === 'sqlite') return `sqlite:${w.id}:${path.resolve(s.dbPath)}`;
  const url = (s.tursoUrl || s.libsqlUrl || '').trim();
  const token = (s.tursoToken || s.libsqlAuthToken || '').trim();
  const identity = createHash('sha256').update(token).digest('hex').slice(0, 16);
  return `remote:${w.id}:${url}:${identity}`;
}

function getProfiles(): WorkspaceProfilesState {
  return readWorkspaceProfilesFile(bootstrapRoot);
}

export interface WorkspaceStoreContext {
  store: INoteStore;
  /** Row filter for notes (inherit: workspace id; dedicated DB: default). */
  tenantId: string;
  /** Profile id for ui-preferences namespacing. */
  workspaceId: string;
}

export interface WorkspaceContextSession {
  resolve: () => Promise<WorkspaceStoreContext>;
  getWorkspaceId: () => string;
  setWorkspaceId: (id: string) => void;
}

async function resolveWorkspaceContext(preferredWorkspaceId: string): Promise<WorkspaceStoreContext> {
  const profiles = getProfiles();
  const id = profiles.workspaces.some((w) => w.id === preferredWorkspaceId && !w.archivedAt)
    ? preferredWorkspaceId
    : profiles.activeWorkspaceId;
  const w = profiles.workspaces.find((x) => x.id === id);
  if (!w) {
    throw new Error('No active workspace profile');
  }
  const s = w.storage ?? { mode: 'inherit' as const };
  if (s.mode === 'inherit') {
    if (!globalStore) throw new Error('Store not initialized');
    return { store: globalStore, tenantId: w.id, workspaceId: w.id };
  }

  const key = workspaceStorageCacheKey(w);
  let st = dedicatedStores.get(key);
  if (!st) {
    if (s.mode === 'sqlite') {
      st = new LocalNoteStore(path.resolve(s.dbPath), path.resolve(s.vaultPath));
    } else {
      const url = (s.tursoUrl || s.libsqlUrl || '').trim();
      const token = (s.tursoToken || s.libsqlAuthToken || '').trim();
      if (!url || !token) {
        throw new Error('Workspace remote storage is missing URL or token');
      }
      const vault = path.join(bootstrapRoot, 'workspaces', w.id, 'vault');
      fs.mkdirSync(vault, { recursive: true });
      const turso = new TursoNoteStore(url, token, vault);
      await turso.initSchema();
      st = turso;
    }
    dedicatedStores.set(key, st);
  }
  return { store: st, tenantId: 'default', workspaceId: w.id };
}

export async function ensureActiveContext(): Promise<WorkspaceStoreContext> {
  return resolveWorkspaceContext(activeWorkspaceId);
}

/** An independent workspace selection for one MCP connection/server. */
export function createWorkspaceContextSession(initialWorkspaceId: string): WorkspaceContextSession {
  let workspaceId = initialWorkspaceId;
  return {
    resolve: () => resolveWorkspaceContext(workspaceId),
    getWorkspaceId: () => workspaceId,
    setWorkspaceId: (id: string) => {
      workspaceId = id;
    },
  };
}

export function closeDedicatedStores(): void {
  for (const st of dedicatedStores.values()) {
    try {
      st.close();
    } catch {
      /* ignore */
    }
  }
  dedicatedStores.clear();
}

/** Purge notes for a workspace during permanent deletion (inherit: tenant on global DB; remote: dedicated Turso). */
export async function purgeWorkspaceNotesForProfile(entry: WorkspaceProfileEntry): Promise<void> {
  const st = entry.storage ?? { mode: 'inherit' as const };
  if (st.mode === 'sqlite') return;
  if (st.mode === 'inherit') {
    if (globalStore) {
      await globalStore.purgeTenantNotes(entry.id);
    } else if (bootstrapRoot) {
      await purgeWorkspaceTenantData(bootstrapRoot, entry);
    }
    return;
  }
  if (bootstrapRoot) {
    await purgeWorkspaceTenantData(bootstrapRoot, entry);
  }
}

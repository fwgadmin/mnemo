/**
 * Resolves the active INoteStore + tenantId for the current workspace (inherit vs dedicated DB).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { INoteStore, WorkspaceProfileEntry, WorkspaceProfilesState } from '../shared/types';
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import { purgeWorkspaceTenantData, readWorkspaceProfilesFile } from './workspaceProfiles';

let globalStore: INoteStore | null = null;
let bootstrapRoot = '';
let activeWorkspaceId = 'default';

/** Dedicated stores keyed by stable string (sqlite path or remote URL). */
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

function storageKey(w: WorkspaceProfileEntry): string {
  const s = w.storage ?? { mode: 'inherit' as const };
  if (s.mode === 'inherit') return 'global';
  if (s.mode === 'sqlite') return `sqlite:${path.resolve(s.dbPath)}`;
  const url = (s.tursoUrl || s.libsqlUrl || '').trim();
  return `remote:${url}`;
}

function getProfiles(): WorkspaceProfilesState {
  return readWorkspaceProfilesFile(bootstrapRoot);
}

export async function ensureActiveContext(): Promise<{
  store: INoteStore;
  /** Row filter for notes (inherit: workspace id; dedicated DB: default). */
  tenantId: string;
  /** Profile id for ui-preferences namespacing. */
  workspaceId: string;
}> {
  const profiles = getProfiles();
  const id = profiles.workspaces.some(w => w.id === activeWorkspaceId)
    ? activeWorkspaceId
    : profiles.activeWorkspaceId;
  const w = profiles.workspaces.find(x => x.id === id);
  if (!w) {
    throw new Error('No active workspace profile');
  }
  const s = w.storage ?? { mode: 'inherit' as const };
  if (s.mode === 'inherit') {
    if (!globalStore) throw new Error('Store not initialized');
    return { store: globalStore, tenantId: w.id, workspaceId: w.id };
  }

  const key = storageKey(w);
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
      const vault = path.join(bootstrapRoot, 'vault');
      fs.mkdirSync(vault, { recursive: true });
      const turso = new TursoNoteStore(url, token, vault);
      await turso.initSchema();
      st = turso;
    }
    dedicatedStores.set(key, st);
  }
  return { store: st, tenantId: 'default', workspaceId: w.id };
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

/** Purge notes for a workspace when archiving/deleting a profile (inherit: tenant on global DB; remote: dedicated Turso). */
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

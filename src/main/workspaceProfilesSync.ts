/**
 * Merge workspace-profiles.json with Turso app_kv (same pattern as ui-preferences).
 * Last-write-wins: compare disk mtime vs app_kv.updated_at.
 * Remote payload is workspace list + storage only; activeWorkspaceId stays on disk per device (not synced).
 * Cloud workspace list is union-merged with disk so a minimal remote payload cannot wipe local vaults.
 * After merge, we add profile rows for any tenant_id present in the DB but missing from profiles (repair).
 * If the active inherit workspace has no notes but another inherit workspace does (e.g. after profile sync skew),
 * switch active to the tenant with the most notes so the vault is not empty on load.
 */
import * as fs from 'fs';
import type { INoteStore, WorkspaceProfilesState } from '../shared/types';
import { TursoNoteStore } from './store/TursoNoteStore';
import {
  augmentWorkspacesWithTenantIdsFromDb,
  combineLocalActiveWithWorkspaces,
  DEFAULT_WORKSPACE_ID,
  defaultWorkspaceProfilesState,
  mergeWorkspaceListsUnion,
  parseWorkspaceProfilesWorkspacesOnly,
  readWorkspaceProfilesFile,
  workspaceProfilesFilePath,
  workspaceProfilesRemotePayload,
  WORKSPACE_PROFILES_KV_KEY,
  writeWorkspaceProfilesFile,
  writeWorkspaceProfilesFileDiskOnly,
} from './workspaceProfiles';

async function augmentProfilesWithNoteTenants(
  store: INoteStore | null | undefined,
  root: string,
  state: WorkspaceProfilesState,
): Promise<WorkspaceProfilesState> {
  if (!store) return state;
  let tenantIds: string[];
  try {
    tenantIds = await store.listDistinctTenantIds();
  } catch {
    return state;
  }
  if (tenantIds.length === 0) return state;
  const mergedW = augmentWorkspacesWithTenantIdsFromDb(state.workspaces, tenantIds);
  const idsBefore = state.workspaces.map(w => w.id).sort().join('\0');
  const idsAfter = mergedW.map(w => w.id).sort().join('\0');
  if (idsBefore === idsAfter) return state;
  const next = combineLocalActiveWithWorkspaces(state.activeWorkspaceId, mergedW);
  writeWorkspaceProfilesFile(root, next);
  return next;
}

/** When active is inherit + empty but another inherit tenant has rows, pick that tenant (max count). */
async function preferActiveTenantWithNotes(
  store: INoteStore | null | undefined,
  root: string,
  state: WorkspaceProfilesState,
): Promise<WorkspaceProfilesState> {
  if (!store) return state;
  const activeEntry = state.workspaces.find(w => w.id === state.activeWorkspaceId);
  const mode = activeEntry?.storage?.mode ?? 'inherit';
  if (mode !== 'inherit') return state;

  let counts: Record<string, number>;
  try {
    counts = await store.getNoteCountsByTenant();
  } catch {
    return state;
  }

  const currentN = counts[state.activeWorkspaceId] ?? 0;
  if (currentN > 0) return state;

  const inheritIds = state.workspaces
    .filter(w => (w.storage ?? { mode: 'inherit' as const }).mode === 'inherit')
    .map(w => w.id);
  let bestId = state.activeWorkspaceId;
  let bestCount = 0;
  for (const id of inheritIds) {
    const n = counts[id] ?? 0;
    if (n > bestCount) {
      bestCount = n;
      bestId = id;
    }
  }
  if (bestCount === 0) return state;
  if (bestId === state.activeWorkspaceId) return state;

  const next = combineLocalActiveWithWorkspaces(bestId, state.workspaces);
  writeWorkspaceProfilesFile(root, next);
  return next;
}

async function finalizeWithTenantRepair(
  store: INoteStore | null | undefined,
  root: string,
  state: WorkspaceProfilesState,
): Promise<WorkspaceProfilesState> {
  let s = await augmentProfilesWithNoteTenants(store, root, state);
  s = await preferActiveTenantWithNotes(store, root, s);
  return s;
}

export async function readWorkspaceProfilesMerged(
  store: INoteStore | null | undefined,
  root: string,
): Promise<WorkspaceProfilesState> {
  const p = workspaceProfilesFilePath(root);
  const exists = fs.existsSync(p);

  if (!exists) {
    if (store instanceof TursoNoteStore) {
      const entry = await store.getKvEntry(WORKSPACE_PROFILES_KV_KEY);
      if (entry) {
        try {
          const workspaces = parseWorkspaceProfilesWorkspacesOnly(JSON.parse(entry.value) as unknown);
          const merged = combineLocalActiveWithWorkspaces(DEFAULT_WORKSPACE_ID, workspaces);
          writeWorkspaceProfilesFileDiskOnly(root, merged);
          return finalizeWithTenantRepair(store, root, merged);
        } catch {
          /* fall through to create default */
        }
      }
    }
    const d = defaultWorkspaceProfilesState();
    writeWorkspaceProfilesFile(root, d);
    return finalizeWithTenantRepair(store, root, d);
  }

  const diskState = readWorkspaceProfilesFile(root);
  const diskMtime = fs.statSync(p).mtimeMs;

  if (!(store instanceof TursoNoteStore)) {
    return finalizeWithTenantRepair(store, root, diskState);
  }

  const entry = await store.getKvEntry(WORKSPACE_PROFILES_KV_KEY);
  if (!entry) {
    await store.setKv(WORKSPACE_PROFILES_KV_KEY, JSON.stringify(workspaceProfilesRemotePayload(diskState)));
    return finalizeWithTenantRepair(store, root, diskState);
  }

  let cloudUpdatedMs = Date.parse(entry.updatedAt);
  if (Number.isNaN(cloudUpdatedMs)) cloudUpdatedMs = 0;

  let cloudWorkspaces: WorkspaceProfilesState['workspaces'];
  try {
    cloudWorkspaces = parseWorkspaceProfilesWorkspacesOnly(JSON.parse(entry.value) as unknown);
  } catch {
    return finalizeWithTenantRepair(store, root, diskState);
  }

  if (cloudUpdatedMs > diskMtime) {
    const mergedW = mergeWorkspaceListsUnion(diskState.workspaces, cloudWorkspaces);
    const merged = combineLocalActiveWithWorkspaces(diskState.activeWorkspaceId, mergedW);
    writeWorkspaceProfilesFileDiskOnly(root, merged);
    return finalizeWithTenantRepair(store, root, merged);
  }

  if (diskMtime > cloudUpdatedMs) {
    await store.setKv(WORKSPACE_PROFILES_KV_KEY, JSON.stringify(workspaceProfilesRemotePayload(diskState)));
  }
  return finalizeWithTenantRepair(store, root, diskState);
}

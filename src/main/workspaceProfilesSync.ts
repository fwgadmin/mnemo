/**
 * Merge workspace-profiles.json with Turso app_kv (same pattern as ui-preferences).
 * Newer side wins per field (disk mtime vs app_kv.updated_at), but a placeholder name (the id) never
 * replaces a real one and profiles missing from one side are kept unless tombstoned.
 * Remote payload is workspace list + storage + optional deletion tombstones; activeWorkspaceId stays on disk per device (not synced).
 * Deletion tombstones are union-merged so removed vaults stay removed across devices.
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
  filterWorkspacesByDeletedIds,
  mergeDeletedWorkspaceIds,
  mergeWorkspacesWhenCloudNewer,
  parseWorkspaceProfilesKvPayload,
  readWorkspaceProfilesFileResult,
  restoreWorkspaceNames,
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
  const mergedW = augmentWorkspacesWithTenantIdsFromDb(state.workspaces, tenantIds, {
    skipIds: new Set(state.deletedWorkspaceIds ?? []),
  });
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

  // Only adjust when the active profile is still the default vault. If the user chose another
  // workspace (CLI `workspace switch`, Settings, etc.), keep it even when that tenant is empty —
  // otherwise merge/repair would snap back to the tenant with the most notes.
  if (state.activeWorkspaceId !== DEFAULT_WORKSPACE_ID) {
    return state;
  }

  let counts: Record<string, number>;
  try {
    counts = await store.getNoteCountsByTenant();
  } catch {
    return state;
  }

  const currentN = counts[state.activeWorkspaceId] ?? 0;
  if (currentN > 0) return state;

  const inheritIds = state.workspaces
    .filter(w => !w.archivedAt && (w.storage ?? { mode: 'inherit' as const }).mode === 'inherit')
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
  const read = readWorkspaceProfilesFileResult(root);

  if (read.status !== 'ok') {
    // Missing or unreadable: the cloud copy (when there is one) is the best source. Never push local
    // defaults to the cloud from here — that is what used to erase workspace names everywhere.
    if (store instanceof TursoNoteStore) {
      const entry = await store.getKvEntry(WORKSPACE_PROFILES_KV_KEY);
      if (entry) {
        try {
          const parsed = parseWorkspaceProfilesKvPayload(JSON.parse(entry.value) as unknown);
          const filtered = filterWorkspacesByDeletedIds(
            parsed.workspaces,
            new Set(parsed.deletedWorkspaceIds),
          );
          const merged = combineLocalActiveWithWorkspaces(DEFAULT_WORKSPACE_ID, filtered);
          const withDel: WorkspaceProfilesState = {
            ...merged,
            deletedWorkspaceIds: parsed.deletedWorkspaceIds,
          };
          writeWorkspaceProfilesFileDiskOnly(root, withDel);
          return finalizeWithTenantRepair(store, root, withDel);
        } catch {
          /* fall through to create default */
        }
      }
    }
    if (read.status === 'unreadable') return read.state;
    const d = defaultWorkspaceProfilesState();
    writeWorkspaceProfilesFileDiskOnly(root, d);
    return finalizeWithTenantRepair(store, root, d);
  }

  const diskState = read.state;
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
  let cloudDeleted: string[];
  try {
    const parsed = parseWorkspaceProfilesKvPayload(JSON.parse(entry.value) as unknown);
    cloudWorkspaces = parsed.workspaces;
    cloudDeleted = parsed.deletedWorkspaceIds;
  } catch {
    return finalizeWithTenantRepair(store, root, diskState);
  }

  if (cloudUpdatedMs > diskMtime) {
    const mergedDeleted = mergeDeletedWorkspaceIds(diskState.deletedWorkspaceIds, cloudDeleted);
    const mergedW = mergeWorkspacesWhenCloudNewer(diskState.workspaces, cloudWorkspaces);
    const filtered = filterWorkspacesByDeletedIds(mergedW, new Set(mergedDeleted));
    const merged = combineLocalActiveWithWorkspaces(diskState.activeWorkspaceId, filtered);
    const withDel: WorkspaceProfilesState = { ...merged, deletedWorkspaceIds: mergedDeleted };
    writeWorkspaceProfilesFileDiskOnly(root, withDel);
    return finalizeWithTenantRepair(store, root, withDel);
  }

  if (diskMtime > cloudUpdatedMs) {
    // Disk wins, but keep real names and profiles that only the cloud copy has (another device may
    // have created or renamed them); tombstones from both sides still apply.
    const mergedDeleted = mergeDeletedWorkspaceIds(diskState.deletedWorkspaceIds, cloudDeleted);
    const diskIds = new Set(diskState.workspaces.map(w => w.id));
    const unionW = [
      ...restoreWorkspaceNames(diskState.workspaces, cloudWorkspaces),
      ...cloudWorkspaces.filter(w => !diskIds.has(w.id)),
    ];
    const filtered = filterWorkspacesByDeletedIds(unionW, new Set(mergedDeleted));
    const merged = combineLocalActiveWithWorkspaces(diskState.activeWorkspaceId, filtered);
    const next: WorkspaceProfilesState = { ...merged, deletedWorkspaceIds: mergedDeleted };
    if (JSON.stringify(next) !== JSON.stringify(diskState)) writeWorkspaceProfilesFileDiskOnly(root, next);
    await store.setKv(WORKSPACE_PROFILES_KV_KEY, JSON.stringify(workspaceProfilesRemotePayload(next)));
    return finalizeWithTenantRepair(store, root, next);
  }
  return finalizeWithTenantRepair(store, root, diskState);
}

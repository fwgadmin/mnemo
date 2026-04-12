/**
 * Merge workspace-profiles.json with Turso app_kv (same pattern as ui-preferences).
 * Last-write-wins: compare disk mtime vs app_kv.updated_at.
 */
import * as fs from 'fs';
import type { INoteStore, WorkspaceProfilesState } from '../shared/types';
import { TursoNoteStore } from './store/TursoNoteStore';
import {
  defaultWorkspaceProfilesState,
  parseWorkspaceProfilesState,
  readWorkspaceProfilesFile,
  workspaceProfilesFilePath,
  WORKSPACE_PROFILES_KV_KEY,
  writeWorkspaceProfilesFile,
  writeWorkspaceProfilesFileDiskOnly,
} from './workspaceProfiles';

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
          const cloud = parseWorkspaceProfilesState(JSON.parse(entry.value) as unknown);
          writeWorkspaceProfilesFileDiskOnly(root, cloud);
          return cloud;
        } catch {
          /* fall through to create default */
        }
      }
    }
    const d = defaultWorkspaceProfilesState();
    writeWorkspaceProfilesFile(root, d);
    return d;
  }

  const diskState = readWorkspaceProfilesFile(root);
  const diskMtime = fs.statSync(p).mtimeMs;

  if (!(store instanceof TursoNoteStore)) {
    return diskState;
  }

  const entry = await store.getKvEntry(WORKSPACE_PROFILES_KV_KEY);
  if (!entry) {
    await store.setKv(WORKSPACE_PROFILES_KV_KEY, JSON.stringify(diskState));
    return diskState;
  }

  let cloudUpdatedMs = Date.parse(entry.updatedAt);
  if (Number.isNaN(cloudUpdatedMs)) cloudUpdatedMs = 0;

  let cloudState: WorkspaceProfilesState;
  try {
    cloudState = parseWorkspaceProfilesState(JSON.parse(entry.value) as unknown);
  } catch {
    return diskState;
  }

  if (cloudUpdatedMs > diskMtime) {
    writeWorkspaceProfilesFileDiskOnly(root, cloudState);
    return cloudState;
  }

  if (diskMtime > cloudUpdatedMs) {
    await store.setKv(WORKSPACE_PROFILES_KV_KEY, JSON.stringify(diskState));
  }
  return diskState;
}

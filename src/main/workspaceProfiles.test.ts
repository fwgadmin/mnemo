import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceProfilesState } from '../shared/types';
import {
  applyWorkspaceRemovalDataPurge,
  archiveWorkspaceProfile,
  combineLocalActiveWithWorkspaces,
  deleteWorkspaceProfile,
  mergeWorkspacesWhenCloudNewer,
  parseWorkspaceProfilesKvPayload,
  restoreWorkspaceProfile,
  setActiveWorkspace,
  workspaceProfilesRemotePayload,
  writeWorkspaceProfilesFileDiskOnly,
} from './workspaceProfiles';
import { workspaceStorageCacheKey } from './storeResolver';

const cleanupDirectories: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirectories.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function fixture(): {
  root: string;
  dbPath: string;
  vaultPath: string;
  state: WorkspaceProfilesState;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-workspace-archive-test-'));
  cleanupDirectories.push(root);
  const dbPath = path.join(root, 'dedicated.db');
  const vaultPath = path.join(root, 'dedicated-vault');
  fs.writeFileSync(dbPath, 'database-data');
  fs.mkdirSync(vaultPath);
  fs.writeFileSync(path.join(vaultPath, 'note.md'), 'note-data');
  const state: WorkspaceProfilesState = {
    activeWorkspaceId: 'default',
    workspaces: [
      { id: 'default', name: 'Default', storage: { mode: 'inherit' } },
      {
        id: 'work',
        name: 'Work',
        storage: { mode: 'sqlite', dbPath, vaultPath },
      },
    ],
    deletedWorkspaceIds: [],
  };
  writeWorkspaceProfilesFileDiskOnly(root, state);
  return { root, dbPath, vaultPath, state };
}

describe('reversible workspace archive', () => {
  it('retains profile metadata and files until restored', () => {
    const { root, dbPath, vaultPath } = fixture();
    const archived = archiveWorkspaceProfile(root, 'work');

    expect(archived?.state.workspaces.find((w) => w.id === 'work')).toMatchObject({
      id: 'work',
      storage: { mode: 'sqlite', dbPath, vaultPath },
    });
    expect(archived?.state.workspaces.find((w) => w.id === 'work')?.archivedAt).toMatch(/Z$/);
    expect(archived?.state.deletedWorkspaceIds).toEqual([]);
    expect(fs.readFileSync(dbPath, 'utf8')).toBe('database-data');
    expect(fs.readFileSync(path.join(vaultPath, 'note.md'), 'utf8')).toBe('note-data');
    expect(setActiveWorkspace(root, 'work')).toBeNull();

    const restored = restoreWorkspaceProfile(root, 'work');
    expect(restored?.state.workspaces.find((w) => w.id === 'work')?.archivedAt).toBeUndefined();
    expect(setActiveWorkspace(root, 'work')?.activeWorkspaceId).toBe('work');
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(fs.existsSync(vaultPath)).toBe(true);
  });

  it('preserves archived state through remote payload parsing and cloud-newer merges', () => {
    const { state } = fixture();
    const archivedAt = '2026-08-01T12:00:00.000Z';
    const archivedState: WorkspaceProfilesState = {
      ...state,
      workspaces: state.workspaces.map((w) => (w.id === 'work' ? { ...w, archivedAt } : w)),
    };
    const parsed = parseWorkspaceProfilesKvPayload(workspaceProfilesRemotePayload(archivedState));
    expect(parsed.workspaces.find((w) => w.id === 'work')?.archivedAt).toBe(archivedAt);

    const merged = mergeWorkspacesWhenCloudNewer(state.workspaces, parsed.workspaces);
    expect(merged.find((w) => w.id === 'work')?.archivedAt).toBe(archivedAt);
    expect(combineLocalActiveWithWorkspaces('work', merged).activeWorkspaceId).toBe('default');
  });

  it('keeps permanent deletion destructive and tombstoned', async () => {
    const { root, dbPath, vaultPath } = fixture();
    const archived = archiveWorkspaceProfile(root, 'work');
    const entry = archived!.state.workspaces.find((w) => w.id === 'work')!;
    const deleted = deleteWorkspaceProfile(root, 'work');

    expect(deleted?.state.workspaces.some((w) => w.id === 'work')).toBe(false);
    expect(deleted?.state.deletedWorkspaceIds).toContain('work');
    await applyWorkspaceRemovalDataPurge(root, entry);
    expect(fs.existsSync(dbPath)).toBe(false);
    expect(fs.existsSync(vaultPath)).toBe(false);
  });
});

describe('workspace secret isolation', () => {
  it('does not sync dedicated tokens and preserves the receiving device token', () => {
    const disk: WorkspaceProfilesState['workspaces'] = [
      {
        id: 'work',
        name: 'Work',
        storage: {
          mode: 'remote',
          tursoUrl: 'libsql://shared',
          tursoToken: 'device-a',
        },
      },
    ];
    const payload = workspaceProfilesRemotePayload({
      activeWorkspaceId: 'work',
      workspaces: disk,
      deletedWorkspaceIds: [],
    });
    expect(payload.workspaces[0]?.storage).toEqual({
      mode: 'remote',
      tursoUrl: 'libsql://shared',
    });

    const merged = mergeWorkspacesWhenCloudNewer(disk, payload.workspaces);
    expect(merged.find((workspace) => workspace.id === 'work')?.storage).toMatchObject({
      tursoToken: 'device-a',
    });
  });

  it('keys remote clients by profile and token identity without exposing the token', () => {
    const first = workspaceStorageCacheKey({
      id: 'one',
      name: 'One',
      storage: {
        mode: 'remote',
        tursoUrl: 'libsql://shared',
        tursoToken: 'token-a',
      },
    });
    const second = workspaceStorageCacheKey({
      id: 'two',
      name: 'Two',
      storage: {
        mode: 'remote',
        tursoUrl: 'libsql://shared',
        tursoToken: 'token-b',
      },
    });
    expect(first).not.toBe(second);
    expect(first).not.toContain('token-a');
  });
});

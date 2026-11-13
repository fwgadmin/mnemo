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
  readWorkspaceProfilesFileResult,
  restoreWorkspaceNames,
  mergeWorkspacesPreferring,
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

describe('workspace names survive sync and bad reads', () => {
  const named = (id: string, name: string) => ({ id, name, storage: { mode: 'inherit' as const } });

  it('never lets a placeholder (id) name replace a real one, and keeps device-only profiles', () => {
    const disk = [named('default', 'Default'), named('ws-a', 'Research'), named('ws-b', 'Ops')];
    const cloud = [named('default', 'Default'), named('ws-a', 'ws-a'), named('ws-c', 'New on laptop')];
    const merged = mergeWorkspacesWhenCloudNewer(disk, cloud);
    expect(merged.map((w) => [w.id, w.name])).toEqual([
      ['default', 'Default'],
      ['ws-a', 'Research'],
      ['ws-c', 'New on laptop'],
      ['ws-b', 'Ops'],
    ]);
    // A real rename from the cloud still wins.
    expect(mergeWorkspacesWhenCloudNewer(disk, [named('ws-a', 'Renamed')]).find((w) => w.id === 'ws-a')?.name).toBe(
      'Renamed',
    );
    expect(restoreWorkspaceNames([named('ws-a', 'ws-a')], [named('ws-a', 'Research')])[0]?.name).toBe('Research');
  });

  it('reports a corrupt profiles file as unreadable and refuses to overwrite it', () => {
    const { root } = fixture();
    const p = path.join(root, 'workspace-profiles.json');
    fs.writeFileSync(p, '{"workspaces": [');
    expect(readWorkspaceProfilesFileResult(root).status).toBe('unreadable');
    expect(() => setActiveWorkspace(root, 'default')).toThrow(/not overwriting/);
    expect(fs.readFileSync(p, 'utf-8')).toBe('{"workspaces": [');
    fs.rmSync(p);
    expect(readWorkspaceProfilesFileResult(root).status).toBe('missing');
  });

  it('writes atomically without leaving temp files behind', () => {
    const { root, state } = fixture();
    writeWorkspaceProfilesFileDiskOnly(root, { ...state, workspaces: [...state.workspaces, named('ws-z', 'Zed')] });
    expect(fs.readdirSync(root).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(readWorkspaceProfilesFileResult(root).state.workspaces.find((w) => w.id === 'ws-z')?.name).toBe('Zed');
  });
});

describe('workspace sync review follow-ups', () => {
  const named = (id: string, name: string) => ({ id, name, storage: { mode: 'inherit' as const } });

  it('merges preferring one side while keeping the other side’s names and extra profiles', () => {
    const merged = mergeWorkspacesPreferring(
      [named('default', 'Default'), named('ws-a', 'ws-a'), named('ws-b', 'Local rename')],
      [named('ws-a', 'Research'), named('ws-b', 'Old'), named('ws-c', 'Cloud only')],
    );
    expect(merged.map((w) => w.name)).toEqual(['Default', 'Research', 'Local rename', 'Cloud only']);
  });

  it('keeps deletion markers when tenant repair rewrites the profiles', async () => {
    const { root } = fixture();
    writeWorkspaceProfilesFileDiskOnly(root, {
      activeWorkspaceId: 'default',
      workspaces: [named('default', 'Default')],
      deletedWorkspaceIds: ['ws-gone'],
    });
    const store = {
      listDistinctTenantIds: async () => ['default', 'ws-new', 'ws-gone'],
      getNoteCountsByTenant: async () => ({ default: 1 }),
    } as unknown as import('../shared/types').INoteStore;
    const { readWorkspaceProfilesMerged } = await import('./workspaceProfilesSync');
    const state = await readWorkspaceProfilesMerged(store, root);
    expect(state.workspaces.map((w) => w.id)).toEqual(['default', 'ws-new']);
    expect(state.deletedWorkspaceIds).toEqual(['ws-gone']);
    expect(readWorkspaceProfilesFileResult(root).state.deletedWorkspaceIds).toEqual(['ws-gone']);
  });
});

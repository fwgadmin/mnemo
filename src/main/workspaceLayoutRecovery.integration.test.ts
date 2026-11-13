import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalNoteStore } from './store/NoteStore';
import { recoverMisplacedDefaultWorkspace } from './workspaceLayoutRecovery';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function root(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-layout-'));
  dirs.push(d);
  return d;
}

function writeProfiles(r: string, workspaces: unknown[]): void {
  fs.writeFileSync(
    path.join(r, 'workspace-profiles.json'),
    JSON.stringify({ activeWorkspaceId: 'default', workspaces, deletedWorkspaceIds: [] }),
  );
}

/** What older CLI/MCP builds did on every command (inverse of the canonical layout). */
function simulateOldCliMove(r: string): void {
  const nested = path.join(r, 'workspaces', 'default');
  fs.mkdirSync(nested, { recursive: true });
  for (const name of ['mnemo.db', 'mnemo.db-wal', 'mnemo.db-shm', 'ui-preferences.json', 'config.json']) {
    if (fs.existsSync(path.join(r, name))) fs.renameSync(path.join(r, name), path.join(nested, name));
  }
  if (fs.existsSync(path.join(r, 'vault'))) fs.renameSync(path.join(r, 'vault'), path.join(nested, 'vault'));
}

async function seedDesktopVault(r: string): Promise<{ attachmentHash: string }> {
  const store = new LocalNoteStore(path.join(r, 'mnemo.db'), path.join(r, 'vault'));
  try {
    await store.create({ title: 'Desktop note', body: 'one', tenantId: 'default' });
    await store.create({ title: 'Other workspace note', body: 'two', tenantId: 'ws-other' });
    const meta = await store.putAttachment({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png', name: 'a.png' });
    return { attachmentHash: meta.hash };
  } finally {
    store.close();
  }
}

describe('recoverMisplacedDefaultWorkspace', () => {
  it('moves data back when the flat database is missing', async () => {
    const r = root();
    writeProfiles(r, [{ id: 'default', name: 'Default', storage: { mode: 'inherit' } }]);
    await seedDesktopVault(r);
    fs.writeFileSync(path.join(r, 'config.json'), '{"tursoUrl":"libsql://example"}');
    simulateOldCliMove(r);

    expect(await recoverMisplacedDefaultWorkspace(r)).toEqual({ action: 'moved' });
    expect(fs.existsSync(path.join(r, 'config.json'))).toBe(true);
    const store = new LocalNoteStore(path.join(r, 'mnemo.db'), path.join(r, 'vault'));
    try {
      expect((await store.list('default')).map(n => n.title)).toEqual(['Desktop note']);
    } finally {
      store.close();
    }
    expect(await recoverMisplacedDefaultWorkspace(r)).toEqual({ action: 'none' });
  });

  it('merges into a flat database the CLI recreated, keeping tenants, refs, attachments, and archiving the copy', async () => {
    const r = root();
    writeProfiles(r, [
      { id: 'default', name: 'Default', storage: { mode: 'inherit' } },
      { id: 'ws-other', name: 'Other', storage: { mode: 'inherit' } },
    ]);
    const { attachmentHash } = await seedDesktopVault(r);
    simulateOldCliMove(r);

    // The old CLI then opened a brand-new flat database and the user kept working in it.
    const fresh = new LocalNoteStore(path.join(r, 'mnemo.db'), path.join(r, 'vault'));
    const created = await fresh.create({ title: 'Written after the move', body: 'three', tenantId: 'default' });
    fresh.close();
    expect(created.ref).toBe(1);

    const result = await recoverMisplacedDefaultWorkspace(r);
    expect(result.action).toBe('merged');
    expect(result.notes).toBe(2);
    expect(result.attachments).toBe(1);
    expect(fs.existsSync(path.join(result.archivedTo!, 'mnemo.db'))).toBe(true);
    expect(fs.existsSync(path.join(r, 'workspaces', 'default', 'mnemo.db'))).toBe(false);

    const store = new LocalNoteStore(path.join(r, 'mnemo.db'), path.join(r, 'vault'));
    try {
      const def = await store.list('default');
      expect(def.map(n => n.title).sort()).toEqual(['Desktop note', 'Written after the move']);
      expect(new Set(def.map(n => n.ref)).size).toBe(2);
      expect((await store.list('ws-other')).map(n => n.title)).toEqual(['Other workspace note']);
      expect(await store.getAttachment(attachmentHash)).not.toBeNull();
    } finally {
      store.close();
    }
    expect(await recoverMisplacedDefaultWorkspace(r)).toEqual({ action: 'none' });
  });

  it('leaves a dedicated SQLite default workspace that lives in workspaces/default alone', async () => {
    const r = root();
    const dbPath = path.join(r, 'workspaces', 'default', 'mnemo.db');
    writeProfiles(r, [
      { id: 'default', name: 'Default', storage: { mode: 'sqlite', dbPath, vaultPath: path.join(r, 'workspaces', 'default', 'vault') } },
    ]);
    const store = new LocalNoteStore(dbPath, path.join(r, 'workspaces', 'default', 'vault'));
    await store.create({ title: 'Dedicated', body: '' });
    store.close();

    expect(await recoverMisplacedDefaultWorkspace(r)).toEqual({ action: 'none' });
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(fs.existsSync(path.join(r, 'mnemo.db'))).toBe(false);
  });
});

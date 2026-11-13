import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SyncNoteRow } from '../../shared/types';
import { LocalNoteStore } from './NoteStore';
import { TursoNoteStore } from './TursoNoteStore';
import { pullTursoIntoLocalStore, pushLocalToTursoStore } from '../storePullRemote';

const cleanupDirectories: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirectories.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('two-store synchronization', () => {
  it('converges deletions, recreations, and exact link additions/removals', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-sync-contract-test-'));
    cleanupDirectories.push(root);
    const primaryPath = path.join(root, 'primary.db');
    const replicaPath = path.join(root, 'replica.db');
    const primary = new LocalNoteStore(primaryPath, path.join(root, 'primary-vault'));
    const remote = new TursoNoteStore(`file:${path.join(root, 'remote.db')}`, '');
    await remote.initSchema();

    try {
      const target = await primary.create({ title: 'Target', body: '', tags: [] });
      const source = await primary.create({ title: 'Source', body: 'linked', tags: ['Work'] });
      await primary.updateLinks(source.id, [target.id]);
      await pushLocalToTursoStore(remote, primaryPath);
      expect((await remote.read(source.id))?.links).toEqual([target.id]);

      await pullTursoIntoLocalStore(remote, replicaPath, path.join(root, 'replica-vault'));
      const replicaBeforeDelete = new LocalNoteStore(replicaPath, path.join(root, 'replica-vault'));
      expect((await replicaBeforeDelete.read(source.id))?.links).toEqual([target.id]);
      replicaBeforeDelete.close();

      await primary.updateLinks(source.id, []);
      await pushLocalToTursoStore(remote, primaryPath);
      expect((await remote.read(source.id))?.links).toEqual([]);

      expect(await primary.delete(source.id)).toBe(true);
      await pushLocalToTursoStore(remote, primaryPath);
      expect(await remote.read(source.id)).toBeNull();

      await pullTursoIntoLocalStore(remote, replicaPath, path.join(root, 'replica-vault'));
      const replicaAfterDelete = new LocalNoteStore(replicaPath, path.join(root, 'replica-vault'));
      expect(await replicaAfterDelete.read(source.id)).toBeNull();
      replicaAfterDelete.close();

      const stale: SyncNoteRow = {
        id: source.id,
        title: source.title,
        body: source.body,
        tags: JSON.stringify(source.tags),
        tenant_id: source.tenantId,
        created_at: source.created,
        updated_at: source.modified,
        ref: source.ref,
        hide_header: source.hideHeader ? 1 : 0,
      };
      await remote.importNotes([stale], [{ source_id: source.id, target_id: target.id }]);
      expect(await remote.read(source.id)).toBeNull();

      const recreated = { ...stale, title: 'Source recreated', updated_at: '9999-01-01T00:00:00.000Z' };
      await remote.importNotes([recreated], [{ source_id: source.id, target_id: target.id }]);
      expect(await remote.read(source.id)).toMatchObject({ title: 'Source recreated', links: [target.id] });
      expect((await remote.exportAllNotesAndLinks()).tombstones.some(t => t.id === source.id)).toBe(false);

      await remote.importNotes([recreated], []);
      expect((await remote.read(source.id))?.links).toEqual([]);
      await remote.importNotes([recreated], []);
      expect((await remote.read(source.id))?.links).toEqual([]);

      expect(await remote.delete(target.id)).toBe(true);
      await pullTursoIntoLocalStore(remote, replicaPath, path.join(root, 'replica-vault'));
      const replicaAfterRemoteDelete = new LocalNoteStore(replicaPath, path.join(root, 'replica-vault'));
      expect(await replicaAfterRemoteDelete.read(target.id)).toBeNull();
      replicaAfterRemoteDelete.close();

      // The primary still has the old target, but its stale upload cannot resurrect the remote deletion.
      await pushLocalToTursoStore(remote, primaryPath);
      expect(await remote.read(target.id)).toBeNull();
    } finally {
      primary.close();
      remote.close();
    }
  });
});

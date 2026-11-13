import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ATTACHMENT_CHUNK_BYTES } from '../../shared/attachments';
import type { INoteStore } from '../../shared/types';
import { LocalNoteStore } from './NoteStore';
import { TursoNoteStore } from './TursoNoteStore';
import { pullTursoIntoLocalStore, pushLocalToTursoStore } from '../storePullRemote';

const cleanupDirectories: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirectories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function root(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mnemo-attach-${label}-`));
  cleanupDirectories.push(dir);
  return dir;
}

/** Deterministic pseudo-random bytes spanning several chunks. */
function sampleBytes(size: number, seed = 7): Uint8Array {
  const out = new Uint8Array(size);
  let x = seed;
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x & 0xff;
  }
  return out;
}

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function exerciseStore(store: INoteStore): Promise<void> {
  const bytes = sampleBytes(ATTACHMENT_CHUNK_BYTES * 2 + 1234);
  const meta = await store.putAttachment({ bytes, mime: 'image/png', name: 'shot.png', tenantId: 'ws1' });
  expect(meta.hash).toBe(sha(bytes));
  expect(meta.size).toBe(bytes.byteLength);

  const again = await store.putAttachment({ bytes, mime: 'image/png', name: 'renamed.png', tenantId: 'ws1' });
  expect(again).toEqual(meta);
  expect(await store.listAttachmentRows()).toHaveLength(1);

  const loaded = await store.getAttachment(meta.hash, 'ws1');
  expect(loaded?.meta.name).toBe('shot.png');
  expect(Buffer.from(loaded!.bytes).equals(Buffer.from(bytes))).toBe(true);

  expect(await store.getAttachment(meta.hash, 'other-tenant')).toBeNull();
  expect(await store.getAttachment('not-a-hash', 'ws1')).toBeNull();

  const wrong = { ...(await store.listAttachmentRows())[0]!, hash: sha(sampleBytes(10)) };
  expect(await store.importAttachment(wrong, bytes)).toBe(false);

  await store.purgeTenantNotes('ws1');
  expect(await store.listAttachmentRows()).toHaveLength(0);
}

describe('attachment storage', () => {
  it('local store round-trips multi-chunk attachments, dedupes, scopes by tenant, purges', async () => {
    const dir = root('local');
    const store = new LocalNoteStore(path.join(dir, 'mnemo.db'), path.join(dir, 'vault'));
    try {
      await exerciseStore(store);
    } finally {
      store.close();
    }
  });

  it('libSQL store round-trips multi-chunk attachments, dedupes, scopes by tenant, purges', async () => {
    const dir = root('remote');
    const store = new TursoNoteStore(`file:${path.join(dir, 'remote.db')}`, '', path.join(dir, 'vault'));
    await store.initSchema();
    await exerciseStore(store);
  });

  it('treats a corrupted chunk as unavailable instead of serving bad bytes', async () => {
    const dir = root('corrupt');
    const dbPath = path.join(dir, 'mnemo.db');
    const store = new LocalNoteStore(dbPath, path.join(dir, 'vault'));
    const meta = await store.putAttachment({ bytes: sampleBytes(4096), mime: 'text/plain', name: 'a.txt' });
    store.close();

    const db = new Database(dbPath);
    db.prepare('UPDATE attachment_chunks SET data = ? WHERE hash = ?').run(Buffer.from(sampleBytes(4096, 99)), meta.hash);
    db.close();

    const reopened = new LocalNoteStore(dbPath, path.join(dir, 'vault'));
    try {
      expect(await reopened.getAttachment(meta.hash)).toBeNull();
    } finally {
      reopened.close();
    }
  });

  it('mirrors attachment files into the vault', async () => {
    const dir = root('mirror');
    const vault = path.join(dir, 'vault');
    const store = new LocalNoteStore(path.join(dir, 'mnemo.db'), vault);
    try {
      const meta = await store.putAttachment({ bytes: sampleBytes(100), mime: 'image/jpeg', name: 'p.jpg' });
      expect(fs.existsSync(path.join(vault, '_attachments', `${meta.hash}.jpg`))).toBe(true);
    } finally {
      store.close();
    }
  });
});

describe('attachment synchronization', () => {
  it('push and pull copy missing attachments in both directions', async () => {
    const dir = root('sync');
    const primaryPath = path.join(dir, 'primary.db');
    const replicaPath = path.join(dir, 'replica.db');
    const remote = new TursoNoteStore(`file:${path.join(dir, 'remote.db')}`, '');
    await remote.initSchema();

    const primary = new LocalNoteStore(primaryPath, path.join(dir, 'primary-vault'));
    const fromPrimary = await primary.putAttachment({
      bytes: sampleBytes(ATTACHMENT_CHUNK_BYTES + 5),
      mime: 'application/pdf',
      name: 'doc.pdf',
    });
    await primary.create({ title: 'With file', body: `![x](mnemo-asset://asset/${fromPrimary.hash}.pdf)` });
    primary.close();

    await pushLocalToTursoStore(remote, primaryPath);
    expect((await remote.getAttachment(fromPrimary.hash))?.meta.name).toBe('doc.pdf');

    const fromRemote = await remote.putAttachment({ bytes: sampleBytes(64, 3), mime: 'image/gif', name: 'r.gif' });
    await pullTursoIntoLocalStore(remote, replicaPath, path.join(dir, 'replica-vault'));
    await pushLocalToTursoStore(remote, primaryPath); // idempotent second push

    const replica = new LocalNoteStore(replicaPath, path.join(dir, 'replica-vault'));
    try {
      expect((await replica.listAttachmentRows()).map(r => r.hash).sort()).toEqual(
        [fromPrimary.hash, fromRemote.hash].sort(),
      );
      expect((await replica.getAttachment(fromPrimary.hash))?.bytes.byteLength).toBe(ATTACHMENT_CHUNK_BYTES + 5);
    } finally {
      replica.close();
    }
    expect(await remote.listAttachmentRows()).toHaveLength(2);
  });
});

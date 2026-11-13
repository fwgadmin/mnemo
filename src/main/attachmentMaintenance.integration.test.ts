import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { INoteStore } from '../shared/types';
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import { attachmentStats, convertInlineMedia, removeUnusedAttachments } from './attachmentMaintenance';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const PDF = Buffer.from('%PDF-1.4 test').toString('base64');
const DAY = 24 * 60 * 60 * 1000;

async function exercise(store: INoteStore, vault?: string): Promise<void> {
  const body = [
    'Intro',
    `![shot](data:image/png;base64,${PNG} "mnemo:w=40;align=left")`,
    `[📎 spec.pdf](data:application/pdf;base64,${PDF} "mnemo:attachment")`,
    `[zip](data:application/zip;base64,${PDF})`,
  ].join('\n\n');
  const note = await store.create({ title: 'Legacy', body });
  expect((await attachmentStats(store, 'default')).notesWithInlineMedia).toBe(1);

  expect(await convertInlineMedia(store, 'default')).toEqual({ notes: 1, converted: 2, skipped: 1 });
  const after = (await store.read(note.id))!.body;
  expect(after).toMatch(/!\[shot\]\(mnemo-asset:\/\/asset\/[0-9a-f]{64}\.png "mnemo:w=40;align=left"\)/);
  expect(after).toMatch(/\[📎 spec\.pdf\]\(mnemo-asset:\/\/asset\/[0-9a-f]{64}\.pdf "mnemo:attachment"\)/);
  expect(after).toContain('data:application/zip;base64,');
  expect(await convertInlineMedia(store, 'default')).toEqual({ notes: 0, converted: 0, skipped: 1 });

  const orphan = await store.putAttachment({ bytes: new Uint8Array([9, 9, 9]), mime: 'image/gif', name: 'o.gif' });
  const stats = await attachmentStats(store, 'default');
  expect(stats.count).toBe(3);
  expect(stats.unused).toBe(0); // inside the grace period
  const later = Date.now() + 2 * DAY;
  expect((await removeUnusedAttachments(store, 'default', { now: later, dryRun: true })).removed).toBe(1);
  expect(await removeUnusedAttachments(store, 'default', { now: later })).toEqual({ removed: 1, bytes: 3 });
  expect(await store.getAttachment(orphan.hash)).toBeNull();
  expect((await store.listAttachmentRows()).length).toBe(2);
  if (vault) expect(fs.existsSync(path.join(vault, '_attachments', `${orphan.hash}.gif`))).toBe(false);
  expect(await store.deleteAttachment(orphan.hash)).toBe(false);
}

describe('attachment maintenance', () => {
  it('local store: converts inline media, reports stats, removes unused attachments', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-maint-'));
    dirs.push(dir);
    const store = new LocalNoteStore(path.join(dir, 'mnemo.db'), path.join(dir, 'vault'));
    try {
      await exercise(store, path.join(dir, 'vault'));
    } finally {
      store.close();
    }
  });

  it('libSQL store: same behaviour', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-maint-r-'));
    dirs.push(dir);
    const store = new TursoNoteStore(`file:${path.join(dir, 'r.db')}`, '');
    await store.initSchema();
    await exercise(store);
  });
});

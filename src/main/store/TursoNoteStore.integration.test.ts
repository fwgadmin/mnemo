import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TursoNoteStore } from './TursoNoteStore';

const cleanupDirectories: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirectories.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('TursoNoteStore data contracts', () => {
  it('preserves search metadata and safely decodes malformed tags', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-turso-contract-test-'));
    cleanupDirectories.push(root);
    const url = `file:${path.join(root, 'mnemo.db')}`;
    const store = new TursoNoteStore(url, '');
    await store.initSchema();

    const target = await store.create({ title: 'Remote Target', body: 'Destination', tags: ['Reference'] });
    const source = await store.create({
      title: 'Remote Source',
      body: `remote contract needle\n![large](data:image/png;base64,${'A'.repeat(1_000_000)})`,
      tags: ['Work', 'Work/Remote'],
    });
    await store.updateLinks(source.id, [target.id]);

    const client = createClient({ url });
    try {
      await client.execute({
        sql: 'UPDATE notes SET tags = ? WHERE id = ?',
        args: ['{"category":"not-an-array"}', source.id],
      });

      expect((await store.read(source.id))?.tags).toEqual([]);
      const list = await store.list();
      expect(list.find(note => note.id === source.id)?.tags).toEqual([]);
      expect(list.find(note => note.id === source.id)?.snippet).toHaveLength(120);
      expect(JSON.stringify(list).length).toBeLessThan(2_000);
      expect((await store.search('remote contract'))[0]).toMatchObject({
        id: source.id,
        tags: [],
        created: source.created,
        modified: source.modified,
      });
      expect((await store.getBacklinks(target.id))[0]).toMatchObject({ id: source.id, tags: [] });
    } finally {
      client.close();
      store.close();
    }
  });

  it('saves note content and links in one guarded write batch', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-turso-save-test-'));
    cleanupDirectories.push(root);
    const store = new TursoNoteStore(`file:${path.join(root, 'mnemo.db')}`, '');
    await store.initSchema();
    try {
      const target = await store.create({ title: 'Target', body: '', tags: [] });
      const source = await store.create({ title: 'Source', body: 'old', tags: [] });
      const result = await store.save(
        { id: source.id, title: source.title, body: 'new', expectedModified: source.modified },
        [target.id],
      );
      expect(result.status).toBe('saved');
      expect((await store.read(source.id))?.body).toBe('new');
      expect((await store.getBacklinks(target.id)).map(note => note.id)).toEqual([source.id]);

      const stale = await store.save(
        { id: source.id, title: source.title, body: 'stale', expectedModified: source.modified },
        [],
      );
      expect(stale.status).toBe('conflict');
      expect((await store.read(source.id))?.body).toBe('new');
      expect((await store.getBacklinks(target.id)).map(note => note.id)).toEqual([source.id]);
    } finally {
      store.close();
    }
  });

  it('moves and deletes notes across bounded remote batches', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-turso-bulk-test-'));
    cleanupDirectories.push(root);
    const url = `file:${path.join(root, 'mnemo.db')}`;
    const store = new TursoNoteStore(url, '');
    await store.initSchema();
    const client = createClient({ url });
    const now = '2026-01-01T00:00:00.000Z';
    try {
      await client.batch(Array.from({ length: 205 }, (_, index) => ({
        sql: `INSERT INTO notes
              (id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header)
              VALUES (?, ?, '', ?, 'default', ?, ?, ?, 0)`,
        args: [`bulk-${index}`, `Bulk ${index}`, JSON.stringify([`Work/Batch-${index % 5}`]), now, now, index + 1],
      })), 'write');

      const moved = await store.moveCategoryPrefix(
        { sourcePath: 'Work', targetPath: 'Archive/Work', includeDescendants: true },
      );
      expect(moved).toMatchObject({ requested: 205, affected: 205, failures: [] });
      expect((await store.list()).every(note => note.tags[0]?.startsWith('Archive/Work/'))).toBe(true);

      const deleted = await store.deleteNotes(Array.from({ length: 205 }, (_, index) => `bulk-${index}`));
      expect(deleted).toMatchObject({ requested: 205, affected: 205, failures: [] });
      expect(await store.list()).toHaveLength(0);
    } finally {
      client.close();
      store.close();
    }
  });
});

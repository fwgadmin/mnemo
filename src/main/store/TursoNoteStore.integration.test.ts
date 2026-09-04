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
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalNoteStore } from './NoteStore';

const cleanupDirectories: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirectories.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('LocalNoteStore', () => {
  it('creates, lists, searches, links, updates, mirrors, and deletes notes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-store-test-'));
    cleanupDirectories.push(root);
    const vault = path.join(root, 'vault');
    const store = new LocalNoteStore(path.join(root, 'mnemo.db'), vault);

    try {
      const first = await store.create({ title: 'Alpha', body: 'Searchable body', tags: ['Work'] });
      const second = await store.create({ title: 'Beta', body: 'Links to Alpha', tags: ['Work/Meetings'] });
      expect(first.ref).toBe(1);
      expect(second.ref).toBe(2);
      expect((await store.list()).map(note => note.id).sort()).toEqual([second.id, first.id].sort());
      expect((await store.search('Searchable')).map(note => note.id)).toEqual([first.id]);

      await store.updateLinks(second.id, [first.id]);
      expect((await store.getBacklinks(first.id)).map(note => note.id)).toEqual([second.id]);

      const updated = await store.update({ id: first.id, title: 'Alpha Updated' });
      expect(updated?.title).toBe('Alpha Updated');
      expect(fs.readFileSync(path.join(vault, `${first.id}.md`), 'utf8')).toContain('title: "Alpha Updated"');

      expect(await store.delete(first.id)).toBe(true);
      expect(await store.read(first.id)).toBeNull();
      expect(fs.existsSync(path.join(vault, `${first.id}.md`))).toBe(false);
    } finally {
      store.close();
    }
  });

  it('preserves search metadata and tolerates malformed persisted tags on every read path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-store-contract-test-'));
    cleanupDirectories.push(root);
    const dbPath = path.join(root, 'mnemo.db');
    const store = new LocalNoteStore(dbPath, path.join(root, 'vault'));

    try {
      const target = await store.create({ title: 'Target', body: 'Destination', tags: ['Reference'] });
      const source = await store.create({
        title: 'Corrupt Source',
        body: 'contract needle links to Target',
        tags: ['Work', 'Work/Tests'],
      });
      await store.updateLinks(source.id, [target.id]);

      const raw = new Database(dbPath);
      try {
        raw.prepare('UPDATE notes SET tags = ? WHERE id = ?').run('not-json', source.id);
      } finally {
        raw.close();
      }

      expect((await store.read(source.id))?.tags).toEqual([]);
      expect((await store.list()).find(note => note.id === source.id)?.tags).toEqual([]);

      const result = (await store.search('contract needle'))[0];
      expect(result).toMatchObject({
        id: source.id,
        tags: [],
        created: source.created,
        modified: source.modified,
      });
      expect(result.created).not.toBe('');
      expect(result.modified).not.toBe('');

      expect((await store.getBacklinks(target.id))[0]).toMatchObject({ id: source.id, tags: [] });
    } finally {
      store.close();
    }
  });
});

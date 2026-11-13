import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalNoteStore } from './NoteStore';
import { TursoNoteStore } from './TursoNoteStore';
import { pullTursoIntoLocalStore, pushLocalToTursoStore } from '../storePullRemote';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
function root(): string { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-refcol-')); dirs.push(d); return d; }

describe('sync with colliding refs', () => {
  it('keeps both notes when two devices created different notes with the same ref', async () => {
    const dir = root();
    const remote = new TursoNoteStore(`file:${path.join(dir, 'remote.db')}`, '');
    await remote.initSchema();
    const a = new LocalNoteStore(path.join(dir, 'a.db'), path.join(dir, 'a-vault'));
    const b = new LocalNoteStore(path.join(dir, 'b.db'), path.join(dir, 'b-vault'));
    const na = await a.create({ title: 'From A', body: 'a' });
    const nb = await b.create({ title: 'From B', body: 'b' });
    expect(na.ref).toBe(1);
    expect(nb.ref).toBe(1);
    a.close(); b.close();

    await pushLocalToTursoStore(remote, path.join(dir, 'a.db'));
    await pushLocalToTursoStore(remote, path.join(dir, 'b.db'));
    expect((await remote.list()).map(n => n.title).sort()).toEqual(['From A', 'From B']);

    await pullTursoIntoLocalStore(remote, path.join(dir, 'a.db'), path.join(dir, 'a-vault'));
    const a2 = new LocalNoteStore(path.join(dir, 'a.db'), path.join(dir, 'a-vault'));
    try {
      const list = await a2.list();
      expect(list.map(n => n.title).sort()).toEqual(['From A', 'From B']);
      expect(new Set(list.map(n => n.ref)).size).toBe(2);
    } finally { a2.close(); }
  });
});

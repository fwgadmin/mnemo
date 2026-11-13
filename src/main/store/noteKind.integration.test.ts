import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalNoteStore } from './NoteStore';
import { TursoNoteStore } from './TursoNoteStore';
import { pullTursoIntoLocalStore, pushLocalToTursoStore } from '../storePullRemote';
import { emptySheetDoc, serializeSheetDoc } from '../../shared/sheet';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('note kind', () => {
  it('persists sheet kind through create, list, read, push, pull, and the Markdown mirror', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-kind-'));
    dirs.push(dir);
    const remote = new TursoNoteStore(`file:${path.join(dir, 'remote.db')}`, '');
    await remote.initSchema();
    const a = new LocalNoteStore(path.join(dir, 'a.db'), path.join(dir, 'a-vault'));
    const sheet = await a.create({ title: 'Budget', body: serializeSheetDoc(emptySheetDoc()), kind: 'sheet' });
    const md = await a.create({ title: 'Plain', body: 'x' });
    expect(sheet.kind).toBe('sheet');
    expect(md.kind).toBe('markdown');
    expect((await a.list()).find(n => n.id === sheet.id)?.kind).toBe('sheet');
    expect(fs.readFileSync(path.join(dir, 'a-vault', `${sheet.id}.md`), 'utf-8')).toContain('kind: "sheet"');
    a.close();

    await pushLocalToTursoStore(remote, path.join(dir, 'a.db'));
    expect((await remote.read(sheet.id))?.kind).toBe('sheet');
    expect((await remote.list()).find(n => n.id === md.id)?.kind).toBe('markdown');
    const remoteSheet = await remote.create({ title: 'Remote sheet', body: '', kind: 'sheet' });

    await pullTursoIntoLocalStore(remote, path.join(dir, 'b.db'), path.join(dir, 'b-vault'));
    const b = new LocalNoteStore(path.join(dir, 'b.db'), path.join(dir, 'b-vault'));
    try {
      expect((await b.read(sheet.id))?.kind).toBe('sheet');
      expect((await b.read(remoteSheet.id))?.kind).toBe('sheet');
      expect((await b.search('Budget'))[0]?.kind).toBe('sheet');
    } finally {
      b.close();
    }
  });
});

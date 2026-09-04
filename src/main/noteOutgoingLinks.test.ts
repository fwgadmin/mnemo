import { describe, expect, it, vi } from 'vitest';
import type { INoteStore, Note, NoteListItem, SaveNoteResult } from '../shared/types';
import { saveNoteWithOutgoingLinks } from './noteOutgoingLinks';

describe('saveNoteWithOutgoingLinks', () => {
  it('loads one title index and saves explicit and inferred links with the body', async () => {
    const list: NoteListItem[] = [
      { id: 'source', ref: 1, title: 'Source', tags: [], created: 'c', modified: 'r1', snippet: '' },
      { id: 'explicit', ref: 2, title: 'Explicit', tags: [], created: 'c', modified: 'r1', snippet: '' },
      { id: 'inferred', ref: 3, title: 'Inferred Topic', tags: [], created: 'c', modified: 'r1', snippet: '' },
    ];
    const note: Note = {
      id: 'source', ref: 1, title: 'Source', body: '[[Explicit]] and Inferred Topic', tags: [],
      created: 'c', modified: 'r2', tenantId: 'default', links: ['explicit', 'inferred'], hideHeader: false,
    };
    const result: SaveNoteResult = {
      status: 'saved',
      note,
      listItem: { ...list[0]!, modified: 'r2', snippet: note.body },
    };
    const store = {
      list: vi.fn(async () => list),
      save: vi.fn(async () => result),
      resolveTitle: vi.fn(),
    } as unknown as INoteStore;

    await expect(saveNoteWithOutgoingLinks(store, {
      id: 'source', title: 'Source', body: note.body, expectedModified: 'r1',
    }, 'default')).resolves.toBe(result);

    expect(store.list).toHaveBeenCalledTimes(1);
    expect(store.resolveTitle).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ body: note.body }), ['explicit', 'inferred']);
  });
});

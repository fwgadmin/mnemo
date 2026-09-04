import { describe, expect, it, vi } from 'vitest';
import type { SaveNoteInput, SaveNoteResult } from '../shared/types';
import { NoteSaveQueue } from './noteSaveQueue';

function saved(input: SaveNoteInput, modified: string): SaveNoteResult {
  const note = {
    ...input,
    ref: 1,
    tags: [],
    created: '2026-01-01T00:00:00.000Z',
    modified,
    tenantId: 'default',
    links: [],
    hideHeader: false,
  };
  return { status: 'saved', note, listItem: { ...note, snippet: note.body } };
}

describe('NoteSaveQueue', () => {
  it('serializes requests and coalesces pending drafts to the newest content', async () => {
    let release!: (result: SaveNoteResult) => void;
    const first = new Promise<SaveNoteResult>(resolve => { release = resolve; });
    const execute = vi.fn<(input: SaveNoteInput) => Promise<SaveNoteResult>>()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(async input => saved(input, 'r3'));
    const queue = new NoteSaveQueue(execute, () => {});
    queue.seedRevision('n1', 'r1');

    const pending = queue.enqueue({ id: 'n1', title: 'A', body: 'first' });
    void queue.enqueue({ id: 'n1', title: 'A', body: 'second' });
    void queue.enqueue({ id: 'n1', title: 'A', body: 'newest' });
    expect(execute).toHaveBeenCalledTimes(1);
    release(saved(execute.mock.calls[0]![0], 'r2'));
    await pending;

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]![0]).toMatchObject({ body: 'newest', expectedModified: 'r2' });
  });

  it('retains a failed draft and retries it', async () => {
    const execute = vi.fn<(input: SaveNoteInput) => Promise<SaveNoteResult>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async input => saved(input, 'r2'));
    const events: string[] = [];
    const queue = new NoteSaveQueue(execute, event => events.push(event.status));
    queue.seedRevision('n1', 'r1');

    expect(await queue.enqueue({ id: 'n1', title: 'A', body: 'dirty' })).toBe(false);
    expect(await queue.retry('n1')).toBe(true);
    expect(execute.mock.calls[1]![0]).toMatchObject({ body: 'dirty', expectedModified: 'r1' });
    expect(events).toContain('error');
    expect(events.at(-1)).toBe('saved');
  });
});

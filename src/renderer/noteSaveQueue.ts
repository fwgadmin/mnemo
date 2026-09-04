import type { SaveNoteInput, SaveNoteResult } from '../shared/types';

export type NoteSaveDraft = Omit<SaveNoteInput, 'expectedModified'>;
export type NoteSaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface NoteSaveEvent {
  noteId: string;
  status: NoteSaveStatus;
  result?: Extract<SaveNoteResult, { status: 'saved' }>;
  error?: string;
}

interface QueueState {
  revision: string;
  queued: NoteSaveDraft | null;
  failed: NoteSaveDraft | null;
  running: Promise<boolean> | null;
}

/** Per-note serial queue. While a request is running, only the newest pending draft is retained. */
export class NoteSaveQueue {
  private readonly states = new Map<string, QueueState>();

  constructor(
    private readonly execute: (input: SaveNoteInput) => Promise<SaveNoteResult>,
    private readonly onEvent: (event: NoteSaveEvent) => void,
  ) {}

  seedRevision(noteId: string, revision: string): void {
    const state = this.states.get(noteId);
    if (!state) {
      this.states.set(noteId, { revision, queued: null, failed: null, running: null });
    } else if (!state.running && !state.queued && !state.failed) {
      state.revision = revision;
    }
  }

  enqueue(draft: NoteSaveDraft): Promise<boolean> {
    const state = this.states.get(draft.id);
    if (!state) throw new Error(`Save queue has no revision for note ${draft.id}`);
    state.queued = draft;
    state.failed = null;
    this.onEvent({ noteId: draft.id, status: state.running ? 'saving' : 'dirty' });
    return this.start(draft.id, state);
  }

  retry(noteId: string): Promise<boolean> {
    const state = this.states.get(noteId);
    if (!state?.failed) return Promise.resolve(true);
    state.queued = state.failed;
    state.failed = null;
    this.onEvent({ noteId, status: 'dirty' });
    return this.start(noteId, state);
  }

  async flush(noteId?: string): Promise<boolean> {
    const entries = noteId
      ? [...this.states.entries()].filter(([id]) => id === noteId)
      : [...this.states.entries()];
    const results = await Promise.all(entries.map(([id, state]) => this.start(id, state)));
    return results.every(Boolean);
  }

  private start(noteId: string, state: QueueState): Promise<boolean> {
    if (state.running) return state.running;
    if (!state.queued) return Promise.resolve(!state.failed);
    state.running = this.drain(noteId, state).finally(() => {
      state.running = null;
    });
    return state.running;
  }

  private async drain(noteId: string, state: QueueState): Promise<boolean> {
    while (state.queued) {
      const draft = state.queued;
      state.queued = null;
      this.onEvent({ noteId, status: 'saving' });
      try {
        const result = await this.execute({ ...draft, expectedModified: state.revision });
        if (result.status !== 'saved') {
          state.failed = state.queued ?? draft;
          state.queued = null;
          this.onEvent({
            noteId,
            status: 'error',
            error: result.status === 'conflict' ? 'This note changed elsewhere. Retry after reviewing it.' : 'The note no longer exists.',
          });
          return false;
        }
        state.revision = result.note.modified;
        this.onEvent({ noteId, status: state.queued ? 'dirty' : 'saved', result });
      } catch (error) {
        state.failed = state.queued ?? draft;
        state.queued = null;
        this.onEvent({
          noteId,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }
    return true;
  }
}

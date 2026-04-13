import type { Client } from '@libsql/client/web';
import { kvGetItem, kvSetItem } from '../storage/asyncStorageSafe';
import { createNote, deleteNote, updateNote } from '../data/turso';
import { refreshOutgoingLinksForNote } from '../data/noteLinks';
import type { CreateNoteInput, UpdateNoteInput } from '../types';

const OUTBOX_KEY = 'mnemo_v1_outbox';

export type OutboxItem =
  | { v: 1; kind: 'update'; tenantId: string; input: UpdateNoteInput; at: string }
  | { v: 1; kind: 'create'; tenantId: string; input: CreateNoteInput & { id: string }; at: string }
  | { v: 1; kind: 'delete'; tenantId: string; id: string; at: string };

async function loadRaw(): Promise<OutboxItem[]> {
  const raw = await kvGetItem(OUTBOX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRaw(items: OutboxItem[]): Promise<void> {
  await kvSetItem(OUTBOX_KEY, JSON.stringify(items));
}

export async function enqueueUpdate(tenantId: string, input: UpdateNoteInput): Promise<void> {
  const q = await loadRaw();
  const filtered = q.filter(i => !(i.kind === 'update' && i.input.id === input.id));
  filtered.push({
    v: 1,
    kind: 'update',
    tenantId,
    input,
    at: new Date().toISOString(),
  });
  await saveRaw(filtered);
}

export async function enqueueCreate(tenantId: string, input: CreateNoteInput & { id: string }): Promise<void> {
  const q = await loadRaw();
  const filtered = q.filter(i => !(i.kind === 'create' && i.input.id === input.id));
  filtered.push({
    v: 1,
    kind: 'create',
    tenantId,
    input,
    at: new Date().toISOString(),
  });
  await saveRaw(filtered);
}

export async function enqueueDelete(tenantId: string, id: string): Promise<void> {
  const q = await loadRaw();
  const filtered = q.filter(
    i => !(i.kind === 'delete' && i.id === id) && !(i.kind === 'create' && i.input.id === id),
  );
  filtered.push({
    v: 1,
    kind: 'delete',
    tenantId,
    id,
    at: new Date().toISOString(),
  });
  await saveRaw(filtered);
}

export async function flushOutbox(client: Client, tenantId: string): Promise<{ ok: number; failed: number }> {
  const q = await loadRaw();
  let ok = 0;
  let failed = 0;
  const remaining: OutboxItem[] = [];

  for (const item of q) {
    if (item.tenantId !== tenantId) {
      remaining.push(item);
      continue;
    }
    try {
      if (item.kind === 'update') {
        await updateNote(client, item.input);
        await refreshOutgoingLinksForNote(client, item.input.id, tenantId);
      } else if (item.kind === 'create') {
        await createNote(client, item.input);
        await refreshOutgoingLinksForNote(client, item.input.id, tenantId);
      } else if (item.kind === 'delete') {
        await deleteNote(client, item.id);
      }
      ok += 1;
    } catch {
      failed += 1;
      remaining.push(item);
    }
  }

  await saveRaw(remaining);
  return { ok, failed };
}

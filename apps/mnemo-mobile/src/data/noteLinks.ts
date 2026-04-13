import type { Client } from '@libsql/client';
import { extractWikilinks } from '../lib/wikilinks';
import { inferLinkTargetIds, mergeOutgoingLinkTargets } from '../lib/linkInference';
import { getNote, listNotes, resolveTitle, updateLinks } from './turso';

/** Recompute note_links for one note from body (wikilinks + inferred) — matches desktop save pipeline. */
export async function refreshOutgoingLinksForNote(
  client: Client,
  noteId: string,
  tenantId: string,
): Promise<void> {
  const note = await getNote(client, noteId);
  if (!note) return;

  const list = await listNotes(client, tenantId);
  const index = list.map(n => ({ id: n.id, title: n.title, ref: n.ref }));

  const explicitIds: string[] = [];
  for (const t of extractWikilinks(note.body)) {
    const r = await resolveTitle(client, t, tenantId);
    if (r) explicitIds.push(r);
  }
  const inferredIds = inferLinkTargetIds(note.body, note.id, index);
  const targets = mergeOutgoingLinkTargets(explicitIds, inferredIds, note.id);
  await updateLinks(client, note.id, targets);
}

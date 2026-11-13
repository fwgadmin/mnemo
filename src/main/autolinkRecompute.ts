/**
 * Shared wikilink autolink pass (CLI `mnemo note autolink` and MCP `recompute_autolinks`).
 */
import type { INoteStore } from '../shared/types';
import { extractWikilinks } from '../shared/wikilinks';
import { inferLinkTargetIds, mergeOutgoingLinkTargets } from '../shared/linkInference';

export interface AutolinkRecomputeResult {
  dryRun: boolean;
  notesChanged: number;
  newEdges: number;
}

export async function recomputeAutolinks(
  store: INoteStore,
  dryRun: boolean,
  tenantId?: string,
): Promise<AutolinkRecomputeResult> {
  const debug = process.env.MNEMO_AUTOLINK_DEBUG === '1';
  const started = Date.now();
  const notes = await store.listNotes(tenantId);
  if (debug) console.error(`[autolink] loaded ${notes.length} notes in ${Date.now() - started}ms`);
  const index = notes.map((n) => ({ id: n.id, title: n.title, ref: n.ref }));
  const titleToId = new Map<string, string>();
  for (const note of notes) {
    if (!titleToId.has(note.title)) titleToId.set(note.title, note.id);
  }
  let notesChanged = 0;
  let newEdges = 0;
  const updates: Array<{ sourceId: string; targetIds: string[] }> = [];
  for (const [position, note] of notes.entries()) {
    const explicitIds: string[] = [];
    for (const t of extractWikilinks(note.body)) {
      const r = titleToId.get(t);
      if (r) explicitIds.push(r);
    }
    const inferredIds = inferLinkTargetIds(note.body, note.id, index);
    const merged = mergeOutgoingLinkTargets(explicitIds, inferredIds, note.id);
    const prev = new Set(note.links);
    const next = new Set(merged);
    const same =
      prev.size === next.size && [...prev].every((id) => next.has(id));
    if (same) continue;
    newEdges += merged.filter((id) => !prev.has(id)).length;
    notesChanged++;
    updates.push({ sourceId: note.id, targetIds: merged });
    if (debug && (position + 1) % 10 === 0) {
      console.error(`[autolink] scanned ${position + 1}/${notes.length} in ${Date.now() - started}ms`);
    }
  }
  if (!dryRun) await store.updateLinksBatch(updates);
  if (debug) console.error(`[autolink] completed in ${Date.now() - started}ms`);
  return { dryRun, notesChanged, newEdges };
}

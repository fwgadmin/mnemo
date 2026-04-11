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
): Promise<AutolinkRecomputeResult> {
  const list = await store.list();
  const index = list.map((n) => ({ id: n.id, title: n.title, ref: n.ref }));
  let notesChanged = 0;
  let newEdges = 0;
  for (const item of list) {
    const note = await store.read(item.id);
    if (!note) continue;
    const explicitIds: string[] = [];
    for (const t of extractWikilinks(note.body)) {
      const r = await store.resolveTitle(t);
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
    if (!dryRun) await store.updateLinks(note.id, merged);
  }
  return { dryRun, notesChanged, newEdges };
}

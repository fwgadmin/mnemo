/**
 * Outgoing link graph maintenance for main-process code paths (CLI, MCP, rename, import).
 * Mirrors renderer save logic in App.tsx handleUpdateNote + autolinkRecompute.
 */
import type { INoteStore } from '../shared/types';
import { extractWikilinks, parseWikilinkInner } from '../shared/wikilinks';
import { inferLinkTargetIds, mergeOutgoingLinkTargets } from '../shared/linkInference';
import { recomputeAutolinks } from './autolinkRecompute';

const WIKILINK_BODY_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Replace [[oldTitle]] and [[oldTitle|display]] when the target equals oldTitle (trimmed).
 */
export function replaceWikilinkTargetInBody(body: string, oldTitle: string, newTitle: string): string {
  const oldT = oldTitle.trim();
  const newT = newTitle.trim();
  if (oldT === newT) return body;
  return body.replace(WIKILINK_BODY_RE, (full, inner: string) => {
    const { target, display } = parseWikilinkInner(inner);
    if (target.trim() !== oldT) return full;
    const pipe = inner.indexOf('|');
    if (pipe === -1) {
      return `[[${newT}]]`;
    }
    return `[[${newT}|${display}]]`;
  });
}

/** Recompute note_links for one note from its body (wikilinks + inferred). */
export async function refreshOutgoingLinksForNote(
  store: INoteStore,
  noteId: string,
  tenantId: string,
): Promise<void> {
  const note = await store.read(noteId);
  if (!note) return;
  const list = await store.list(tenantId);
  const index = list.map((n) => ({ id: n.id, title: n.title, ref: n.ref }));
  const explicitIds: string[] = [];
  for (const t of extractWikilinks(note.body)) {
    const r = await store.resolveTitle(t, tenantId);
    if (r) explicitIds.push(r);
  }
  const inferredIds = inferLinkTargetIds(note.body, note.id, index);
  const targets = mergeOutgoingLinkTargets(explicitIds, inferredIds, note.id);
  await store.updateLinks(note.id, targets);
}

/** After bulk body writes, refresh edges for each affected note. */
export async function refreshOutgoingLinksAfterBodyWrites(
  store: INoteStore,
  noteIds: string[],
  tenantId: string,
): Promise<void> {
  const unique = [...new Set(noteIds)];
  for (const id of unique) {
    await refreshOutgoingLinksForNote(store, id, tenantId);
  }
}

/**
 * After a note's title changed in the DB: rewrite [[oldTitle]] wikilinks across the tenant,
 * then recompute all autolinks (fixes inferred title-mention edges when titles shift).
 */
export async function relocateWikilinksAfterTitleChange(
  store: INoteStore,
  oldTitle: string,
  newTitle: string,
  tenantId: string,
): Promise<void> {
  const oldT = oldTitle.trim();
  const newT = newTitle.trim();
  if (oldT === newT) return;

  const list = await store.list(tenantId);
  for (const item of list) {
    const note = await store.read(item.id);
    if (!note) continue;
    const nextBody = replaceWikilinkTargetInBody(note.body, oldT, newT);
    if (nextBody !== note.body) {
      await store.update({ id: note.id, body: nextBody });
    }
  }
  await recomputeAutolinks(store, false, tenantId);
}

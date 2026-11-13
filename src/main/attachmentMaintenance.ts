/**
 * Vault attachment upkeep (no Electron): statistics, converting legacy inline `data:` media into stored
 * attachments, and removing attachments no note references. Used by the desktop app, CLI, and MCP.
 */
import type { INoteStore } from '../shared/types';
import {
  MAX_ATTACHMENT_BYTES,
  attachmentHashesInMarkdown,
  attachmentUrl,
  isAllowedAttachmentMime,
  normalizeAttachmentMime,
} from '../shared/attachments';

/** Attachments younger than this are never removed: a pasted file may not be saved into its note yet. */
export const ATTACHMENT_GC_GRACE_MS = 24 * 60 * 60 * 1000;

export interface AttachmentStats {
  count: number;
  bytes: number;
  unused: number;
  unusedBytes: number;
  /** Notes that still embed base64 `data:` media in their Markdown. */
  notesWithInlineMedia: number;
}

/** Markdown link/image destinations that are base64 data URLs: `](data:mime;base64,....)`. */
const INLINE_MEDIA = /\]\(\s*(data:([a-z0-9.+/-]+)(?:;[a-z0-9=._-]+)*;base64,([A-Za-z0-9+/=\s]+?))(\s+"[^"]*")?\s*\)/gi;

async function referencedHashes(store: INoteStore, tenantId: string): Promise<{ refs: Set<string>; inline: number }> {
  const refs = new Set<string>();
  let inline = 0;
  for (const note of await store.listNotes(tenantId)) {
    for (const h of attachmentHashesInMarkdown(note.body)) refs.add(h);
    INLINE_MEDIA.lastIndex = 0;
    if (INLINE_MEDIA.test(note.body)) inline++;
  }
  return { refs, inline };
}

async function unusedRows(store: INoteStore, tenantId: string, now: number, graceMs: number) {
  const { refs, inline } = await referencedHashes(store, tenantId);
  const rows = (await store.listAttachmentRows()).filter(r => r.tenant_id === tenantId);
  const unused = rows.filter(r => !refs.has(r.hash) && now - Date.parse(r.created_at) >= graceMs);
  return { rows, unused, inline };
}

export async function attachmentStats(store: INoteStore, tenantId: string, now = Date.now()): Promise<AttachmentStats> {
  const { rows, unused, inline } = await unusedRows(store, tenantId, now, ATTACHMENT_GC_GRACE_MS);
  return {
    count: rows.length,
    bytes: rows.reduce((n, r) => n + Number(r.size), 0),
    unused: unused.length,
    unusedBytes: unused.reduce((n, r) => n + Number(r.size), 0),
    notesWithInlineMedia: inline,
  };
}

/** Delete attachments not referenced by any note in the workspace (older than the grace period). */
export async function removeUnusedAttachments(
  store: INoteStore,
  tenantId: string,
  options: { now?: number; graceMs?: number; dryRun?: boolean } = {},
): Promise<{ removed: number; bytes: number }> {
  const { unused } = await unusedRows(store, tenantId, options.now ?? Date.now(), options.graceMs ?? ATTACHMENT_GC_GRACE_MS);
  let removed = 0;
  let bytes = 0;
  for (const row of unused) {
    if (options.dryRun || (await store.deleteAttachment(row.hash, tenantId))) {
      removed++;
      bytes += Number(row.size);
    }
  }
  return { removed, bytes };
}

/**
 * Replace base64 `data:` media in note bodies with stored attachments (same Markdown otherwise, so titles,
 * width/alignment hints, and alt text are kept). Unsupported types and files over the size cap stay inline.
 */
export async function convertInlineMedia(
  store: INoteStore,
  tenantId: string,
): Promise<{ notes: number; converted: number; skipped: number }> {
  let notes = 0;
  let converted = 0;
  let skipped = 0;
  for (const note of await store.listNotes(tenantId)) {
    INLINE_MEDIA.lastIndex = 0;
    if (!INLINE_MEDIA.test(note.body)) continue;
    let changed = false;
    let body = '';
    let last = 0;
    INLINE_MEDIA.lastIndex = 0;
    for (const m of note.body.matchAll(INLINE_MEDIA)) {
      const mime = normalizeAttachmentMime(m[2]!);
      const bytes = Buffer.from(m[3]!.replace(/\s+/g, ''), 'base64');
      body += note.body.slice(last, m.index);
      last = m.index! + m[0].length;
      if (!isAllowedAttachmentMime(mime) || bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        body += m[0];
        skipped++;
        continue;
      }
      const meta = await store.putAttachment({ bytes, mime, name: `inline.${mime.split('/')[1] ?? 'bin'}`, tenantId });
      body += `](${attachmentUrl(meta.hash, meta.mime)}${m[4] ?? ''})`;
      converted++;
      changed = true;
    }
    body += note.body.slice(last);
    if (changed) {
      await store.update({ id: note.id, body });
      notes++;
    }
  }
  return { notes, converted, skipped };
}

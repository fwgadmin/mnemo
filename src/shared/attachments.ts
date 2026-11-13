/**
 * Vault attachments: content-addressed binary files stored beside notes (local SQLite or libSQL)
 * and referenced from Markdown as `mnemo-asset://asset/<sha256>.<ext>`.
 */

/** Per-file cap for stored attachments (owner decision, 2026-11-13). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Stored attachments are split into fixed-size chunks so no single sync statement carries a large blob. */
export const ATTACHMENT_CHUNK_BYTES = 512 * 1024;

export const ATTACHMENT_SCHEME = 'mnemo-asset';

const MIME_TO_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
  'video/mp4': 'mp4',
  'video/ogg': 'ogv',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
});

const EXTENSION_TO_MIME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(MIME_TO_EXTENSION).map(([mime, ext]) => [ext, mime])),
);

export interface AttachmentMeta {
  /** Lowercase hex SHA-256 of the file bytes. */
  hash: string;
  tenantId: string;
  mime: string;
  size: number;
  /** Original file name (display / save-as default only). */
  name: string;
  created: string;
}

/** Database-shaped attachment used by local ↔ libSQL synchronization. */
export interface SyncAttachmentRow {
  hash: string;
  tenant_id: string;
  mime: string;
  size: number;
  name: string;
  created_at: string;
}

export interface PutAttachmentInput {
  bytes: Uint8Array;
  mime: string;
  name: string;
  tenantId?: string;
}

const HASH_RE = /^[0-9a-f]{64}$/;

export function normalizeAttachmentMime(mime: string): string {
  const base = mime.split(';')[0]!.trim().toLowerCase();
  return base === 'image/jpg' ? 'image/jpeg' : base;
}

export function isAllowedAttachmentMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXTENSION, normalizeAttachmentMime(mime));
}

export function extensionForAttachmentMime(mime: string): string {
  return MIME_TO_EXTENSION[normalizeAttachmentMime(mime)] ?? 'bin';
}

export function isAttachmentHash(value: string): boolean {
  return HASH_RE.test(value);
}

/** Clean a user-supplied file name for storage and display (no paths, control chars, or brackets). */
export function sanitizeAttachmentName(name: string, mime: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return cleaned || `attachment.${extensionForAttachmentMime(mime)}`;
}

export function attachmentUrl(hash: string, mime: string): string {
  return `${ATTACHMENT_SCHEME}://asset/${hash}.${extensionForAttachmentMime(mime)}`;
}

/** Parse a `mnemo-asset://asset/<hash>.<ext>` URL; returns null for anything else. */
export function parseAttachmentUrl(url: string | undefined | null): { hash: string; mime: string | null } | null {
  const m = /^mnemo-asset:\/\/asset\/([0-9a-f]{64})(?:\.([a-z0-9]{1,5}))?$/i.exec(url ?? '');
  if (!m) return null;
  const ext = m[2]?.toLowerCase();
  return { hash: m[1]!.toLowerCase(), mime: ext ? EXTENSION_TO_MIME[ext] ?? null : null };
}

/** All attachment hashes referenced by a Markdown body (deduplicated, in first-seen order). */
export function attachmentHashesInMarkdown(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(/mnemo-asset:\/\/asset\/([0-9a-f]{64})/gi)) seen.add(m[1]!.toLowerCase());
  return [...seen];
}

export function validatePutAttachmentInput(raw: unknown): PutAttachmentInput {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid attachment.');
  const input = raw as Record<string, unknown>;
  const bytes =
    input['bytes'] instanceof Uint8Array
      ? input['bytes']
      : input['bytes'] instanceof ArrayBuffer
        ? new Uint8Array(input['bytes'])
        : null;
  if (!bytes) throw new Error('Attachment data is missing.');
  const mime = normalizeAttachmentMime(typeof input['mime'] === 'string' ? input['mime'] : '');
  if (!isAllowedAttachmentMime(mime)) throw new Error(`Unsupported attachment type (${mime || 'unknown'}).`);
  if (bytes.byteLength === 0) throw new Error('Attachment is empty.');
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment is larger than the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit.`);
  }
  const name = sanitizeAttachmentName(typeof input['name'] === 'string' ? input['name'] : '', mime);
  return { bytes, mime, name };
}

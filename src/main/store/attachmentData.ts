import { createHash } from 'crypto';
import { ATTACHMENT_CHUNK_BYTES, MAX_ATTACHMENT_BYTES } from '../../shared/attachments';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function splitAttachmentChunks(bytes: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += ATTACHMENT_CHUNK_BYTES) {
    chunks.push(bytes.subarray(offset, Math.min(offset + ATTACHMENT_CHUNK_BYTES, bytes.byteLength)));
  }
  return chunks;
}

function chunkToBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('Attachment chunk is not binary data.');
}

/**
 * Reassemble ordered chunks and verify them against the stored size and content hash.
 * Returns null if anything is missing or corrupt (callers treat that as "not available").
 */
export function assembleAttachmentChunks(
  rows: ReadonlyArray<{ seq: unknown; data: unknown }>,
  expected: { hash: string; size: number; chunkCount: number },
): Uint8Array | null {
  if (rows.length !== expected.chunkCount || expected.size > MAX_ATTACHMENT_BYTES) return null;
  const ordered = [...rows].sort((a, b) => Number(a.seq) - Number(b.seq));
  const out = new Uint8Array(expected.size);
  let offset = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (Number(ordered[i]!.seq) !== i) return null;
    const chunk = chunkToBytes(ordered[i]!.data);
    if (offset + chunk.byteLength > expected.size) return null;
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== expected.size) return null;
  return sha256Hex(out) === expected.hash ? out : null;
}

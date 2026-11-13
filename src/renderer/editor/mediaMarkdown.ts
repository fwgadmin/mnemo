import { MAX_ATTACHMENT_BYTES, isAllowedAttachmentMime, parseAttachmentUrl } from '../../shared/attachments';

export const MAX_EMBEDDED_MEDIA_BYTES = MAX_ATTACHMENT_BYTES;

export type MediaAlign = 'left' | 'center' | 'right';

export interface MediaDisplayOptions {
  width: number;
  align: MediaAlign;
}

const INLINE_MEDIA_TYPES = /^(?:image\/(?:png|jpe?g|gif|webp|bmp)|audio\/(?:mpeg|mp4|ogg|wav|webm)|video\/(?:mp4|ogg|webm|quicktime))$/i;

export function isInlineMediaType(mime: string): boolean {
  return INLINE_MEDIA_TYPES.test(mime);
}

export function isEmbeddableFileType(mime: string): boolean {
  return isAllowedAttachmentMime(mime);
}

/** MIME type of a `data:` URL (legacy inline media) or a `mnemo-asset://` attachment URL. */
export function parseMediaDataType(src: string | undefined): string | null {
  const asset = parseAttachmentUrl(src);
  if (asset) return asset.mime;
  const m = /^data:([^;,]+)[;,]/i.exec(src ?? '');
  return m?.[1]?.toLowerCase() ?? null;
}

/** Persists file bytes and returns the URL to embed (main process attachment store in the app). */
export type AttachmentStorer = (input: { bytes: ArrayBuffer; mime: string; name: string }) => Promise<{ url: string }>;

function defaultStorer(): AttachmentStorer {
  const api = (globalThis as { mnemo?: { attachments?: { put: AttachmentStorer } } }).mnemo?.attachments;
  if (!api) throw new Error('Attachment storage is not available.');
  return input => api.put(input);
}

export function parseMediaDisplayOptions(title: string | undefined): MediaDisplayOptions {
  const width = /(?:^|[:;])w=(\d{1,3})(?:;|$)/.exec(title ?? '')?.[1];
  const align = /(?:^|;)align=(left|center|right)(?:;|$)/.exec(title ?? '')?.[1] as MediaAlign | undefined;
  return {
    width: Math.max(10, Math.min(100, Number(width) || 80)),
    align: align ?? 'center',
  };
}

export function mediaTitle(options: MediaDisplayOptions): string {
  return `mnemo:w=${Math.round(options.width)};align=${options.align}`;
}

function safeLabel(name: string): string {
  return name.replace(/[[\]\\\n\r]/g, ' ').trim() || 'media';
}

export async function markdownForMediaFile(file: File, store: AttachmentStorer = defaultStorer()): Promise<string> {
  if (!isEmbeddableFileType(file.type)) {
    throw new Error(`${file.name || 'File'} has an unsupported media type (${file.type || 'unknown'}).`);
  }
  if (file.size > MAX_EMBEDDED_MEDIA_BYTES) {
    throw new Error(`${file.name || 'Media'} is larger than the ${MAX_EMBEDDED_MEDIA_BYTES / (1024 * 1024)} MB attachment limit.`);
  }
  const { url } = await store({ bytes: await file.arrayBuffer(), mime: file.type, name: file.name });
  const label = safeLabel(file.name || file.type.split('/')[0] || 'media');
  if (isInlineMediaType(file.type)) {
    return `![${label}](${url} "${mediaTitle({ width: 80, align: 'center' })}")`;
  }
  return `[📎 ${label}](${url} "mnemo:attachment")`;
}

export async function markdownForMediaFiles(files: readonly File[], store?: AttachmentStorer): Promise<string> {
  const parts: string[] = [];
  for (const file of files) parts.push(await markdownForMediaFile(file, store));
  return parts.join('\n\n');
}

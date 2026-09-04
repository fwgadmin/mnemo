export const MAX_EMBEDDED_MEDIA_BYTES = 12 * 1024 * 1024;

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
  return isInlineMediaType(mime) || mime === 'application/pdf' || mime === 'text/plain';
}

export function parseMediaDataType(src: string | undefined): string | null {
  const m = /^data:([^;,]+)[;,]/i.exec(src ?? '');
  return m?.[1]?.toLowerCase() ?? null;
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

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read media file'));
    reader.readAsDataURL(file);
  });
}

export async function markdownForMediaFile(file: File): Promise<string> {
  if (!isEmbeddableFileType(file.type)) {
    throw new Error(`${file.name || 'File'} has an unsupported media type (${file.type || 'unknown'}).`);
  }
  if (file.size > MAX_EMBEDDED_MEDIA_BYTES) {
    throw new Error(`${file.name || 'Media'} is larger than the 12 MB embedded-media limit.`);
  }
  const src = await fileToDataUrl(file);
  const label = safeLabel(file.name || file.type.split('/')[0] || 'media');
  if (isInlineMediaType(file.type)) {
    return `![${label}](${src} "${mediaTitle({ width: 80, align: 'center' })}")`;
  }
  return `[📎 ${label}](${src} "mnemo:attachment")`;
}

export async function markdownForMediaFiles(files: readonly File[]): Promise<string> {
  const parts: string[] = [];
  for (const file of files) parts.push(await markdownForMediaFile(file));
  return parts.join('\n\n');
}

/**
 * Rich clipboard: HTML → Markdown on paste, Markdown → HTML (+ plain Markdown) on copy,
 * and image copy that always lands as PNG (the only image type Chromium's async clipboard writes).
 */
import TurndownService from 'turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import remarkHighlight from './remarkHighlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { MAX_ATTACHMENT_BYTES, parseAttachmentUrl } from '../../shared/attachments';

/** Marker on HTML we put on the clipboard, so pasting back into Mnemo uses the exact Markdown instead. */
export const MNEMO_CLIPBOARD_ATTR = 'data-mnemo-clipboard';

/** Tags that indicate the HTML carries document structure worth converting (vs. syntax-highlighted code). */
const STRUCTURAL_TAG = /<(?:p|h[1-6]|ul|ol|li|table|blockquote|strong|b|em|i|a\s|img|hr|del|s|strike|u|mark)\b/i;

/** Clipboard types written by code editors; their HTML is colouring only, so plain text is correct. */
const CODE_EDITOR_TYPES = ['vscode-editor-data', 'application/x-vnd.jetbrains', 'text/x-moz-url-priv'];

/**
 * Decide whether a paste should convert `text/html` into Markdown.
 * False for our own copies (exact Markdown is in text/plain), code-editor copies, and HTML without structure.
 */
export function shouldConvertHtmlPaste(types: readonly string[], html: string): boolean {
  if (!html.trim()) return false;
  if (types.some(t => CODE_EDITOR_TYPES.includes(t))) return false;
  if (html.includes(MNEMO_CLIPBOARD_ATTR)) return false;
  return STRUCTURAL_TAG.test(html);
}

let turndown: TurndownService | null = null;

function turndownService(): TurndownService {
  if (turndown) return turndown;
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });
  service.use(gfm);
  // Drop things that never belong in a note.
  service.remove(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'form', 'button', 'select', 'input', 'textarea']);
  // Tight list markers ("- item", "1. item") instead of turndown's padded "-   item".
  service.addRule('listItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement | null;
      let prefix = `${options.bulletListMarker} `;
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? '1') || 1;
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      const body = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, `\n${' '.repeat(prefix.length)}`);
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '');
    },
  });
  // Highlights use Obsidian's ==text== syntax; underline has no Markdown form, so keep just the text.
  service.addRule('mark', {
    filter: ['mark'],
    replacement: content => (content.trim() ? `==${content}==` : content),
  });
  service.addRule('underline', {
    filter: ['u', 'ins'],
    replacement: content => content,
  });
  // Images: keep http(s) and Mnemo attachment URLs; drop inline data/blob/file images (they are not portable here).
  service.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const src = el.getAttribute('src') ?? '';
      if (!/^https?:\/\//i.test(src) && !parseAttachmentUrl(src)) return '';
      const alt = (el.getAttribute('alt') ?? '').replace(/[[\]\\\n\r]/g, ' ').trim();
      return `![${alt}](${src})`;
    },
  });
  turndown = service;
  return service;
}

/** Convert clipboard HTML (web pages, Google Docs, Word, email) to Markdown. */
export function htmlToMarkdown(html: string): string {
  // HTML comments need no stripping here: turndown parses the HTML and skips comment nodes.
  const cleaned = html
    // Google Docs wraps everything in <b style="font-weight:normal" id="docs-internal-guid-…">.
    .replace(/<b\b[^>]*id="docs-internal-guid-[^"]*"[^>]*>([\s\S]*)<\/b>/i, '$1');
  return turndownService()
    .turndown(cleaned)
    .replace(/ /g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const htmlSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'del', 'mark'],
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'data', 'mnemo-asset'],
  },
};

export interface MarkdownToHtmlOptions {
  /** Resolve `mnemo-asset://` images to data URLs so other apps can show them. */
  inlineAsset?: (url: string) => Promise<string | null>;
  /** Total byte budget for inlined images (default: one attachment's worth). */
  inlineBudgetBytes?: number;
}

/** Render block Markdown to sanitized HTML, synchronously (note embeds). */
export function markdownBlockToHtml(markdown: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkHighlight)
      .use(remarkRehype, { allowDangerousHtml: false })
      .use(rehypeSanitize, htmlSchema)
      .use(rehypeStringify)
      .processSync(markdown),
  );
}

/** Render inline Markdown (one table cell, one line) to sanitized HTML, synchronously, without a wrapping <p>. */
export function markdownInlineToHtml(markdown: string): string {
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkHighlight)
      .use(remarkRehype, { allowDangerousHtml: false })
      .use(rehypeSanitize, htmlSchema)
      .use(rehypeStringify)
      .processSync(markdown),
  );
  return html.replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1');
}

/** Render Markdown to sanitized HTML for the clipboard (wrapped with the Mnemo marker). */
export async function markdownToClipboardHtml(markdown: string, options: MarkdownToHtmlOptions = {}): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkHighlight)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, htmlSchema)
    .use(rehypeStringify)
    .process(markdown);
  let html = String(file);
  if (options.inlineAsset) {
    let budget = options.inlineBudgetBytes ?? MAX_ATTACHMENT_BYTES;
    const urls = [...new Set([...html.matchAll(/src="(mnemo-asset:\/\/asset\/[0-9a-f]{64}\.[a-z0-9]+)"/gi)].map(m => m[1]!))];
    for (const url of urls) {
      const dataUrl = await options.inlineAsset(url);
      if (!dataUrl || dataUrl.length > budget) continue;
      budget -= dataUrl.length;
      html = html.split(`src="${url}"`).join(`src="${dataUrl}"`);
    }
  }
  return `<div ${MNEMO_CLIPBOARD_ATTR}="1">${html}</div>`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

/** Fetch an attachment image and return a data URL (images only). */
export async function inlineAttachmentImage(url: string): Promise<string | null> {
  const parsed = parseAttachmentUrl(url);
  if (!parsed?.mime?.startsWith('image/')) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/png'),
  );
}

/**
 * Copy an image (data: or mnemo-asset: URL) as PNG, falling back to the Markdown source text.
 * Resolves true only when something actually reached the clipboard (callers like Cut must check).
 */
export async function copyImageToClipboard(src: string, fallbackText?: string): Promise<boolean> {
  try {
    if (!navigator.clipboard.write || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
    const png = await toPngBlob(await (await fetch(src)).blob());
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    if (!fallbackText) return false;
    try {
      await navigator.clipboard.writeText(fallbackText);
      return true;
    } catch {
      return false;
    }
  }
}

/** Write Markdown as text/plain and its rendered HTML as text/html (images inlined for other apps). */
export async function writeRichMarkdownToClipboard(markdown: string): Promise<void> {
  if (!markdown) return;
  try {
    if (!navigator.clipboard.write || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
    const html = await markdownToClipboardHtml(markdown, { inlineAsset: inlineAttachmentImage });
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([markdown], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(markdown).catch(() => {});
  }
}

/** True when converted Markdown contains block structure (headings, lists, tables, multiple paragraphs). */
export function isBlockMarkdown(md: string): boolean {
  return md.includes('\n') || /^(?:#{1,6}\s|[-*+]\s|\d+\.\s|>|\||```|---)/.test(md);
}

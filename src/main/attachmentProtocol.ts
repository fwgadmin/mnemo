import { BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import * as fs from 'fs';
import {
  ATTACHMENT_SCHEME,
  attachmentUrl,
  parseAttachmentUrl,
  sanitizeAttachmentName,
  validatePutAttachmentInput,
  type AttachmentMeta,
} from '../shared/attachments';
import { IPC } from '../shared/types';
import type { WorkspaceStoreContext } from './storeResolver';

/** Must run before `app.whenReady()`. */
export function registerAttachmentScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ATTACHMENT_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (!m[1] && !m[2])) return null;
  let start: number;
  let end: number;
  if (!m[1]) {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  return start <= end && start < size ? { start, end } : null;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cache-Control': 'private, max-age=31536000, immutable',
} as const;

/**
 * Serve `mnemo-asset://asset/<sha256>.<ext>` from the active workspace's store.
 * Only GET, only well-formed hashes, only the active tenant; bytes are hash-verified by the store.
 */
export function handleAttachmentProtocol(getContext: () => Promise<WorkspaceStoreContext>): void {
  protocol.handle(ATTACHMENT_SCHEME, async request => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    const parsed = parseAttachmentUrl(request.url);
    if (!parsed) return new Response(null, { status: 404 });
    try {
      const ctx = await getContext();
      const stored = await ctx.store.getAttachment(parsed.hash, ctx.tenantId);
      if (!stored) return new Response(null, { status: 404 });
      const { bytes, meta } = stored;
      const base = { ...SECURITY_HEADERS, 'Content-Type': meta.mime, 'Accept-Ranges': 'bytes' };
      const range = parseRange(request.headers.get('range'), bytes.byteLength);
      if (range) {
        const body = request.method === 'HEAD' ? null : Buffer.from(bytes.subarray(range.start, range.end + 1));
        return new Response(body, {
          status: 206,
          headers: {
            ...base,
            'Content-Length': String(range.end - range.start + 1),
            'Content-Range': `bytes ${range.start}-${range.end}/${bytes.byteLength}`,
          },
        });
      }
      return new Response(request.method === 'HEAD' ? null : Buffer.from(bytes), {
        status: 200,
        headers: { ...base, 'Content-Length': String(bytes.byteLength) },
      });
    } catch {
      return new Response(null, { status: 500 });
    }
  });
}

export function registerAttachmentIpc(getContext: () => Promise<WorkspaceStoreContext>): void {
  ipcMain.handle(IPC.ATTACHMENT_PUT, async (_event, raw: unknown): Promise<{ meta: AttachmentMeta; url: string }> => {
    const input = validatePutAttachmentInput(raw);
    const ctx = await getContext();
    const meta = await ctx.store.putAttachment({ ...input, tenantId: ctx.tenantId });
    return { meta, url: attachmentUrl(meta.hash, meta.mime) };
  });

  ipcMain.handle(IPC.ATTACHMENT_SAVE_AS, async (event, rawUrl: unknown, rawName: unknown): Promise<boolean> => {
    const parsed = parseAttachmentUrl(typeof rawUrl === 'string' ? rawUrl : '');
    if (!parsed) throw new Error('Not a Mnemo attachment link.');
    const ctx = await getContext();
    const stored = await ctx.store.getAttachment(parsed.hash, ctx.tenantId);
    if (!stored) throw new Error('This attachment is not available in the current workspace.');
    const win = BrowserWindow.fromWebContents(event.sender);
    const defaultPath = sanitizeAttachmentName(
      typeof rawName === 'string' && rawName.trim() ? rawName : stored.meta.name,
      stored.meta.mime,
    );
    const result = win
      ? await dialog.showSaveDialog(win, { defaultPath })
      : await dialog.showSaveDialog({ defaultPath });
    if (result.canceled || !result.filePath) return false;
    await fs.promises.writeFile(result.filePath, stored.bytes);
    return true;
  });
}

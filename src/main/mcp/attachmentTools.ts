/** MCP tools for vault attachments (images return as MCP image content). */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { INoteStore } from '../../shared/types';
import { parseAttachmentUrl } from '../../shared/attachments';
import { attachmentStats } from '../attachmentMaintenance';

type Resolve = () => Promise<{ store: INoteStore; tenantId: string; workspaceId: string }>;

export function registerAttachmentTools(mcp: McpServer, resolve: Resolve): void {
  mcp.tool(
    'get_attachment',
    'Fetch a note attachment by its mnemo-asset:// URL (as written in note Markdown) or 64-hex SHA-256. Images return as image content; other files (PDF, text, audio, video) return base64 with their MIME type.',
    { url: z.string() },
    async args => {
      const { store, tenantId } = await resolve();
      const raw = args.url.trim();
      const hash = parseAttachmentUrl(raw)?.hash ?? (/^[0-9a-f]{64}$/i.test(raw) ? raw.toLowerCase() : null);
      if (!hash) return { content: [{ type: 'text' as const, text: 'Expected a mnemo-asset:// URL or a SHA-256 hash.' }], isError: true };
      const stored = await store.getAttachment(hash, tenantId);
      if (!stored) return { content: [{ type: 'text' as const, text: `Attachment ${hash} not found in this workspace.` }], isError: true };
      const data = Buffer.from(stored.bytes).toString('base64');
      const info = { type: 'text' as const, text: JSON.stringify({ hash, name: stored.meta.name, mime: stored.meta.mime, size: stored.meta.size }) };
      if (stored.meta.mime.startsWith('image/')) {
        return { content: [info, { type: 'image' as const, data, mimeType: stored.meta.mime }] };
      }
      if (stored.meta.mime === 'text/plain') {
        return { content: [info, { type: 'text' as const, text: Buffer.from(stored.bytes).toString('utf-8') }] };
      }
      return { content: [info, { type: 'text' as const, text: data }] };
    },
  );

  mcp.tool(
    'attachment_stats',
    'Attachment counts and sizes for the current workspace, including unused files and notes that still embed base64 data: media.',
    {},
    async () => {
      const { store, tenantId } = await resolve();
      return { content: [{ type: 'text' as const, text: JSON.stringify(await attachmentStats(store, tenantId), null, 2) }] };
    },
  );
}

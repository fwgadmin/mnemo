import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalNoteStore } from '../store/NoteStore';
import { writeWorkspaceProfilesFileDiskOnly } from '../workspaceProfiles';
import { createHttpMcpApp } from './http';

const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

function textContent(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content.find(item => item.type === 'text')?.text ?? '';
}

describe('HTTP MCP workspace isolation', () => {
  it('keeps concurrent Streamable HTTP clients in independent workspaces', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-http-mcp-'));
    const store = new LocalNoteStore(path.join(root, 'mnemo.db'), path.join(root, 'vault'));
    writeWorkspaceProfilesFileDiskOnly(root, {
      activeWorkspaceId: 'default',
      workspaces: [
        { id: 'default', name: 'Default', storage: { mode: 'inherit' } },
        { id: 'work', name: 'Work', storage: { mode: 'inherit' } },
      ],
      deletedWorkspaceIds: [],
    });
    const service = createHttpMcpApp({
      store,
      apiKey: 'integration-secret',
      bootstrapRoot: root,
      initialWorkspaceId: 'default',
      idleTimeoutMs: 60_000,
    });
    const server = http.createServer(service.app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const makeClient = async (name: string) => {
      const transport = new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { Authorization: 'Bearer integration-secret' } },
      });
      const client = new Client({ name, version: '1.0.0' });
      await client.connect(transport);
      return { client, transport };
    };
    const first = await makeClient('first');
    const second = await makeClient('second');
    cleanup.push(async () => {
      await first.client.close().catch(() => {});
      await second.client.close().catch(() => {});
      await service.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    });

    const switched = JSON.parse(
      textContent(await first.client.callTool({ name: 'switch_workspace', arguments: { workspace_id: 'work' } })),
    ) as { activeWorkspaceId: string };
    expect(switched.activeWorkspaceId).toBe('work');
    const workNote = JSON.parse(
      textContent(await first.client.callTool({ name: 'create_note', arguments: { title: 'Work only', body: 'A' } })),
    ) as { tenantId: string };
    const defaultNote = JSON.parse(
      textContent(await second.client.callTool({ name: 'create_note', arguments: { title: 'Default only', body: 'B' } })),
    ) as { tenantId: string };
    expect(workNote.tenantId).toBe('work');
    expect(defaultNote.tenantId).toBe('default');

    const firstList = JSON.parse(textContent(await first.client.callTool({ name: 'list_notes', arguments: {} }))) as {
      notes: Array<{ title: string }>;
    };
    const secondList = JSON.parse(textContent(await second.client.callTool({ name: 'list_notes', arguments: {} }))) as {
      notes: Array<{ title: string }>;
    };
    expect(firstList.notes.map(note => note.title)).toEqual(['Work only']);
    expect(secondList.notes.map(note => note.title)).toEqual(['Default only']);

    const unauthorized = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(unauthorized.status).toBe(401);
    const health = await fetch(`http://127.0.0.1:${address.port}/health`, {
      headers: { Authorization: 'Bearer integration-secret' },
    });
    expect(await health.json()).toMatchObject({ status: 'ok', sessions: 2 });

    await first.transport.terminateSession();
    await first.client.close();
    await new Promise(resolve => setTimeout(resolve, 10));
    const afterClose = await fetch(`http://127.0.0.1:${address.port}/health`, {
      headers: { Authorization: 'Bearer integration-secret' },
    });
    expect(await afterClose.json()).toMatchObject({ status: 'ok', sessions: 1 });

    const tooLarge = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer integration-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ padding: 'x'.repeat(1024 * 1024 + 1) }),
    });
    expect(tooLarge.status).toBe(413);
  });
});

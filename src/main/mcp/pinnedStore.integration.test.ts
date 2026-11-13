import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalNoteStore } from '../store/NoteStore';
import { writeWorkspaceProfilesFileDiskOnly } from '../workspaceProfiles';
import { createMcpServer } from './server';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('MCP server pinned to an explicit store (mnemo mcp --db)', () => {
  it('refuses switch_workspace instead of rewriting the machine-wide active workspace', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-pinned-'));
    dirs.push(root);
    writeWorkspaceProfilesFileDiskOnly(root, {
      activeWorkspaceId: 'default',
      workspaces: [
        { id: 'default', name: 'Default', storage: { mode: 'inherit' } },
        { id: 'ws-other', name: 'Other', storage: { mode: 'inherit' } },
      ],
    });
    const before = fs.readFileSync(path.join(root, 'workspace-profiles.json'), 'utf-8');
    const store = new LocalNoteStore(path.join(root, 'pinned.db'), path.join(root, 'vault'));
    const server = createMcpServer(store, { bootstrapRoot: root });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0' });
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const res = (await client.callTool({ name: 'switch_workspace', arguments: { workspace_id: 'ws-other' } })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
      expect(res.isError).toBe(true);
      expect(res.content[0]!.text).toMatch(/pinned/);
      expect(fs.readFileSync(path.join(root, 'workspace-profiles.json'), 'utf-8')).toBe(before);
    } finally {
      await client.close();
      await server.close();
      store.close();
    }
  });
});

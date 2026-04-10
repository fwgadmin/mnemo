/**
 * Shared bootstrap for the MCP stdio server (used by mnemo-mcp.js and mnemo CLI).
 */
import * as path from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LocalNoteStore } from '../store/NoteStore';
import { TursoNoteStore } from '../store/TursoNoteStore';
import type { INoteStore } from '../../shared/types';
import { resolveTursoCredentials } from '../userConfig';
import { createMcpServer } from './server';

export interface McpStdioArgs {
  dbPath: string;
  vaultPath: string;
  tursoUrl?: string;
  tursoToken?: string;
}

/** Parse argv after subcommand (e.g. pass argv slice after `mcp`). */
export function parseMcpStdioArgs(argv: string[]): McpStdioArgs {
  let dbPath = path.resolve('mnemo.db');
  let vaultPath = path.resolve('vault');
  let tursoUrl: string | undefined;
  let tursoToken: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db' && argv[i + 1]) {
      dbPath = path.resolve(argv[++i]);
    } else if (argv[i] === '--vault' && argv[i + 1]) {
      vaultPath = path.resolve(argv[++i]);
    } else if (argv[i] === '--turso-url' && argv[i + 1]) {
      tursoUrl = argv[++i];
    } else if (argv[i] === '--turso-token' && argv[i + 1]) {
      tursoToken = argv[++i];
    }
  }

  return { dbPath, vaultPath, tursoUrl, tursoToken };
}

export async function runMcpStdioServer(argv: string[]): Promise<void> {
  const parsed = parseMcpStdioArgs(argv);
  const { dbPath, vaultPath } = parsed;
  const { tursoUrl, tursoToken } = resolveTursoCredentials(parsed);

  let store: INoteStore;
  if (tursoUrl && tursoToken) {
    const turso = new TursoNoteStore(tursoUrl, tursoToken, vaultPath);
    await turso.initSchema();
    store = turso;
  } else {
    store = new LocalNoteStore(dbPath, vaultPath);
  }

  const mcp = createMcpServer(store);
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await mcp.close();
    store.close();
    process.exit(0);
  });

  await mcp.connect(transport);
}

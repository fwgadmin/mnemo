#!/usr/bin/env node
/**
 * Standalone MCP server entry point for Mnemo.
 * Communicates via stdio transport — designed for Claude Desktop, Cursor, etc.
 *
 * Usage:
 *   node mnemo-mcp.js [--db <path>] [--vault <path>]
 *   node mnemo-mcp.js --turso-url <url> --turso-token <token> [--vault <path>]
 *
 * Defaults:
 *   --db     ./mnemo.db
 *   --vault  ./vault
 */
import * as path from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LocalNoteStore } from '../store/NoteStore';
import { TursoNoteStore } from '../store/TursoNoteStore';
import type { INoteStore } from '../../shared/types';
import { createMcpServer } from './server';

function parseArgs(): { dbPath: string; vaultPath: string; tursoUrl?: string; tursoToken?: string } {
  const args = process.argv.slice(2);
  let dbPath = path.resolve('mnemo.db');
  let vaultPath = path.resolve('vault');
  let tursoUrl: string | undefined;
  let tursoToken: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) {
      dbPath = path.resolve(args[++i]);
    } else if (args[i] === '--vault' && args[i + 1]) {
      vaultPath = path.resolve(args[++i]);
    } else if (args[i] === '--turso-url' && args[i + 1]) {
      tursoUrl = args[++i];
    } else if (args[i] === '--turso-token' && args[i + 1]) {
      tursoToken = args[++i];
    }
  }

  return { dbPath, vaultPath, tursoUrl, tursoToken };
}

async function main(): Promise<void> {
  const { dbPath, vaultPath, tursoUrl, tursoToken } = parseArgs();

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

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await mcp.close();
    store.close();
    process.exit(0);
  });

  await mcp.connect(transport);
}

main().catch((err) => {
  console.error('Mnemo MCP server failed to start:', err);
  process.exit(1);
});

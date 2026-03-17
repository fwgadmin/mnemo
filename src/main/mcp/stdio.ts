#!/usr/bin/env node
/**
 * Standalone MCP server entry point for Mnemo.
 * Communicates via stdio transport — designed for Claude Desktop, Cursor, etc.
 *
 * Usage:
 *   node mnemo-mcp.js [--db <path>] [--vault <path>]
 *
 * Defaults:
 *   --db     ./mnemo.db
 *   --vault  ./vault
 */
import * as path from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NoteStore } from '../store/NoteStore';
import { createMcpServer } from './server';

function parseArgs(): { dbPath: string; vaultPath: string } {
  const args = process.argv.slice(2);
  let dbPath = path.resolve('mnemo.db');
  let vaultPath = path.resolve('vault');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) {
      dbPath = path.resolve(args[++i]);
    } else if (args[i] === '--vault' && args[i + 1]) {
      vaultPath = path.resolve(args[++i]);
    }
  }

  return { dbPath, vaultPath };
}

async function main(): Promise<void> {
  const { dbPath, vaultPath } = parseArgs();
  const store = new NoteStore(dbPath, vaultPath);
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

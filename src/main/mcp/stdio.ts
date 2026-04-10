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
import { runMcpStdioServer } from './stdio-bootstrap';

runMcpStdioServer(process.argv.slice(2)).catch((err) => {
  console.error('Mnemo MCP server failed to start:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Standalone MCP server entry point for Mnemo.
 * Communicates via stdio transport — designed for Claude Desktop, Cursor, etc.
 *
 * Usage:
 *   node mnemo-mcp.js [--db <path>] [--vault <path>] [--workspace <id|index>]
 *   node mnemo-mcp.js --turso-url <url> --turso-token <token> [--vault <path>]
 *
 * Each server process keeps its workspace selection independently. Use
 * --workspace to pin a client; switch_workspace only changes that connection.
 */
import { runMcpStdioServer } from './stdio-bootstrap';

runMcpStdioServer(process.argv.slice(2)).catch((err) => {
  console.error('Mnemo MCP server failed to start:', err);
  process.exit(1);
});

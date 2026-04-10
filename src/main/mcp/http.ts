#!/usr/bin/env node
/**
 * HTTP/SSE MCP server for Mnemo.
 * Exposes the same MCP tools over HTTP+SSE so hosted AI platforms
 * (ChatGPT, Gemini, etc.) can connect without needing local process access.
 *
 * Required environment variables:
 *   TURSO_URL or LIBSQL_URL         libSQL database URL (Turso Cloud, self-hosted sqld, etc.)
 *   TURSO_AUTH_TOKEN or LIBSQL_AUTH_TOKEN  Database auth token
 *   MCP_API_KEY       Bearer token that clients must send
 *
 * Optional:
 *   PORT              HTTP port (default: 3001)
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { TursoNoteStore } from '../store/TursoNoteStore';
import { createMcpServer } from './server';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const API_KEY = process.env['MCP_API_KEY'];
const TURSO_URL = process.env['TURSO_URL']?.trim() || process.env['LIBSQL_URL']?.trim();
const TURSO_AUTH_TOKEN =
  process.env['TURSO_AUTH_TOKEN']?.trim() || process.env['LIBSQL_AUTH_TOKEN']?.trim();

if (!TURSO_URL || !TURSO_AUTH_TOKEN) {
  console.error(
    'ERROR: Set TURSO_URL and TURSO_AUTH_TOKEN (or LIBSQL_URL and LIBSQL_AUTH_TOKEN) for your libSQL endpoint.',
  );
  process.exit(1);
}
if (!API_KEY) {
  console.error('ERROR: MCP_API_KEY environment variable is required.');
  process.exit(1);
}

// ─── Auth middleware ────────────────────────────────────────────────────────

function requireBearer(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers['authorization'] ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ─── Store + server factory ─────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  const turso = new TursoNoteStore(TURSO_URL!, TURSO_AUTH_TOKEN!);
  await turso.initSchema();

  const app = express();
  app.use(express.json());

  // Keep track of active transports keyed by session ID for routing POST
  const transports = new Map<string, SSEServerTransport>();

  // GET /sse — establish SSE stream
  app.get('/sse', requireBearer, async (req: Request, res: Response) => {
    const mcp = createMcpServer(turso);
    const transport = new SSEServerTransport('/messages', res);

    transports.set(transport.sessionId, transport);

    transport.onclose = () => {
      transports.delete(transport.sessionId);
    };

    await mcp.connect(transport);
  });

  // POST /messages — receive client messages
  app.post('/messages', requireBearer, async (req: Request, res: Response) => {
    const sessionId = req.query['sessionId'] as string | undefined;
    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId query parameter' });
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', sessions: transports.size });
  });

  app.listen(PORT, () => {
    console.log(`Mnemo MCP HTTP server listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Mnemo MCP HTTP server failed to start:', err);
  process.exit(1);
});

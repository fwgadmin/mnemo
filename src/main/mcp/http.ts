#!/usr/bin/env node
/** Authenticated Streamable HTTP MCP server backed by remote libSQL. */
import { randomUUID, timingSafeEqual } from 'crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from 'http';
import type { INoteStore } from '../../shared/types';
import { TursoNoteStore } from '../store/TursoNoteStore';
import {
  closeDedicatedStores,
  createWorkspaceContextSession,
  setGlobalStore,
  setStoreResolverBootstrapRoot,
} from '../storeResolver';
import { migrateLegacyFlatWorkspace } from '../workspaceProfiles';
import { readWorkspaceProfilesMerged } from '../workspaceProfilesSync';
import { resolveWorkspaceBootstrapRoot } from '../userConfig';
import { createMcpServer } from './server';
import { HttpSessionRegistry } from './httpSessions';

const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_BODY_LIMIT = '1mb';

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function bearerMatches(header: string | undefined, expected: string): boolean {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export interface HttpMcpAppOptions {
  store: INoteStore;
  apiKey: string;
  bootstrapRoot: string;
  initialWorkspaceId: string;
  maxSessions?: number;
  idleTimeoutMs?: number;
  requestTimeoutMs?: number;
  bodyLimit?: string;
}

interface StreamableSession {
  transport: StreamableHTTPServerTransport;
  close(): Promise<void>;
}

export function createHttpMcpApp(options: HttpMcpAppOptions): {
  app: express.Express;
  sessions: HttpSessionRegistry<StreamableSession>;
  close: () => Promise<void>;
} {
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const sessions = new HttpSessionRegistry<StreamableSession>(maxSessions, idleTimeoutMs);
  let pendingInitializations = 0;
  setStoreResolverBootstrapRoot(options.bootstrapRoot);
  setGlobalStore(options.store);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: options.bodyLimit ?? DEFAULT_BODY_LIMIT }));
  app.use((req, res, next) => {
    const timeout = req.method === 'GET' && req.path === '/mcp' ? idleTimeoutMs : requestTimeoutMs;
    req.setTimeout(timeout);
    res.setTimeout(timeout, () => {
      if (!res.headersSent) res.status(504).json({ error: 'Request timed out' });
      else res.end();
    });
    next();
  });

  const requireBearer = (req: Request, res: Response, next: NextFunction): void => {
    if (!bearerMatches(req.headers.authorization, options.apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  const sessionIdFrom = (req: Request): string => {
    const raw = req.headers['mcp-session-id'];
    return typeof raw === 'string' ? raw : '';
  };

  app.post('/mcp', requireBearer, async (req, res) => {
    const sessionId = sessionIdFrom(req);
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }
    if (sessionId) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'An initialize request is required to create a session' });
      return;
    }
    sessions.sweep();
    if (sessions.size + pendingInitializations >= maxSessions) {
      res.status(503).json({ error: 'Session limit reached' });
      return;
    }

    pendingInitializations++;
    const workspaceSession = createWorkspaceContextSession(options.initialWorkspaceId);
    const mcp = createMcpServer(workspaceSession.resolve, {
      workspaceSession,
      bootstrapRoot: options.bootstrapRoot,
    });
    let registeredId = '';
    let closing = false;
    const closeMcp = async () => {
      if (closing) return;
      closing = true;
      await mcp.close();
    };
    let resource: StreamableSession;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: id => {
        registeredId = id;
        if (!sessions.add(id, resource)) throw new Error('Session limit reached');
      },
      onsessionclosed: id => {
        void sessions.remove(id);
      },
    });
    resource = {
      transport,
      close: closeMcp,
    };
    transport.onclose = () => {
      if (registeredId) sessions.forget(registeredId);
      void closeMcp();
    };
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (registeredId) await sessions.remove(registeredId);
      else await resource.close();
      if (!res.headersSent) res.status(500).json({ error: 'Failed to initialize MCP session' });
    } finally {
      pendingInitializations--;
    }
  });

  const handleExistingSession = async (req: Request, res: Response) => {
    const sessionId = sessionIdFrom(req);
    if (!sessionId) {
      res.status(400).json({ error: 'Missing MCP-Session-Id header' });
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    await session.transport.handleRequest(req, res);
  };

  app.get('/mcp', requireBearer, handleExistingSession);
  app.delete('/mcp', requireBearer, handleExistingSession);
  app.all(['/sse', '/messages'], requireBearer, (_req, res) => {
    res.status(410).json({ error: 'Legacy SSE was removed; connect with Streamable HTTP at /mcp.' });
  });

  app.get('/health', requireBearer, (_req, res) => {
    sessions.sweep();
    res.json({ status: 'ok', sessions: sessions.size });
  });

  const timer = setInterval(() => sessions.sweep(), Math.min(idleTimeoutMs, 60_000));
  timer.unref();
  return {
    app,
    sessions,
    close: async () => {
      clearInterval(timer);
      await sessions.closeAll();
    },
  };
}

async function bootstrap(): Promise<void> {
  const port = boundedInt(process.env.PORT, 3001, 1, 65_535);
  const host = process.env.MCP_HTTP_HOST?.trim() || '127.0.0.1';
  const apiKey = process.env.MCP_API_KEY;
  const url = process.env.TURSO_URL?.trim() || process.env.LIBSQL_URL?.trim();
  const token = process.env.TURSO_AUTH_TOKEN?.trim() || process.env.LIBSQL_AUTH_TOKEN?.trim();
  if (!url || !token) throw new Error('Set TURSO_URL and TURSO_AUTH_TOKEN (or LIBSQL equivalents).');
  if (!apiKey) throw new Error('MCP_API_KEY environment variable is required.');

  const root = resolveWorkspaceBootstrapRoot();
  migrateLegacyFlatWorkspace(root);
  setStoreResolverBootstrapRoot(root);
  const store = new TursoNoteStore(url, token);
  await store.initSchema();
  setGlobalStore(store);
  const profiles = await readWorkspaceProfilesMerged(store, root);
  const service = createHttpMcpApp({
    store,
    apiKey,
    bootstrapRoot: root,
    initialWorkspaceId: profiles.activeWorkspaceId,
    maxSessions: boundedInt(process.env.MCP_HTTP_MAX_SESSIONS, DEFAULT_MAX_SESSIONS, 1, 10_000),
    idleTimeoutMs: boundedInt(process.env.MCP_HTTP_IDLE_MS, DEFAULT_IDLE_MS, 10_000, 86_400_000),
    requestTimeoutMs: boundedInt(
      process.env.MCP_HTTP_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1_000,
      300_000,
    ),
    bodyLimit: process.env.MCP_HTTP_BODY_LIMIT?.trim() || DEFAULT_BODY_LIMIT,
  });
  const server: Server = service.app.listen(port, host, () => {
    console.log(`Mnemo MCP HTTP server listening on ${host}:${port}`);
  });
  const shutdown = async () => {
    server.close();
    await service.close();
    closeDedicatedStores();
    store.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

if (require.main === module) {
  bootstrap().catch(error => {
    console.error('Mnemo MCP HTTP server failed to start:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

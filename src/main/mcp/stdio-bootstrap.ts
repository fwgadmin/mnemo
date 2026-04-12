/**
 * Shared bootstrap for the MCP stdio server (used by mnemo-mcp.js and mnemo CLI).
 */
import * as path from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LocalNoteStore } from '../store/NoteStore';
import { TursoNoteStore } from '../store/TursoNoteStore';
import type { INoteStore } from '../../shared/types';
import { resolveTursoCredentials } from '../userConfig';
import {
  getLocalWorkspaceDbPathsForCli,
  listWorkspaceProfiles,
  migrateLegacyFlatWorkspace,
} from '../workspaceProfiles';
import { resolveWorkspaceBootstrapRoot } from '../userConfig';
import {
  closeDedicatedStores,
  ensureActiveContext,
  setActiveWorkspaceId,
  setGlobalStore,
  setStoreResolverBootstrapRoot,
} from '../storeResolver';
import { createMcpServer } from './server';

export interface McpStdioArgs {
  dbPath: string;
  vaultPath: string;
  tursoUrl?: string;
  tursoToken?: string;
  /** When set, scopes inherit-mode notes to this workspace id (same as GUI / `mnemo note --workspace`). */
  workspaceId?: string;
}

/** Parse argv after subcommand (e.g. pass argv slice after `mcp`). */
export function parseMcpStdioArgs(argv: string[]): McpStdioArgs {
  let dbPath = path.resolve('mnemo.db');
  let vaultPath = path.resolve('vault');
  let tursoUrl: string | undefined;
  let tursoToken: string | undefined;
  let workspaceId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db' && argv[i + 1]) {
      dbPath = path.resolve(argv[++i]);
    } else if (argv[i] === '--vault' && argv[i + 1]) {
      vaultPath = path.resolve(argv[++i]);
    } else if (argv[i] === '--turso-url' && argv[i + 1]) {
      tursoUrl = argv[++i];
    } else if (argv[i] === '--turso-token' && argv[i + 1]) {
      tursoToken = argv[++i];
    } else if (argv[i] === '--workspace' && argv[i + 1]) {
      workspaceId = argv[++i];
    }
  }

  return { dbPath, vaultPath, tursoUrl, tursoToken, workspaceId };
}

export async function runMcpStdioServer(argv: string[]): Promise<void> {
  const parsed = parseMcpStdioArgs(argv);
  const { dbPath, vaultPath, workspaceId: wsArg } = parsed;
  const { tursoUrl, tursoToken } = resolveTursoCredentials(parsed);
  const usedExplicitDb = argv.includes('--db');
  const root = resolveWorkspaceBootstrapRoot();
  migrateLegacyFlatWorkspace(root);
  setStoreResolverBootstrapRoot(root);

  let store: INoteStore;
  if (tursoUrl && tursoToken) {
    const vPath = argv.includes('--vault') ? vaultPath : path.join(root, 'vault');
    const turso = new TursoNoteStore(tursoUrl, tursoToken, vPath);
    await turso.initSchema();
    store = turso;
  } else if (usedExplicitDb) {
    store = new LocalNoteStore(dbPath, vaultPath);
  } else {
    const boot = getLocalWorkspaceDbPathsForCli();
    store = new LocalNoteStore(boot.dbPath, boot.vaultPath);
  }

  const mcp = usedExplicitDb
    ? createMcpServer(store)
    : (() => {
        setGlobalStore(store);
        const profiles = listWorkspaceProfiles(root);
        const w = wsArg?.trim();
        const id =
          w && profiles.workspaces.some(x => x.id === w) ? w : profiles.activeWorkspaceId;
        setActiveWorkspaceId(id);
        return createMcpServer(ensureActiveContext);
      })();

  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await mcp.close();
    closeDedicatedStores();
    store.close();
    process.exit(0);
  });

  await mcp.connect(transport);
}

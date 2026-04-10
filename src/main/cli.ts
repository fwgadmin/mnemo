#!/usr/bin/env node
/**
 * Node CLI bundle: MCP stdio, MCP HTTP (spawn), and note subcommands.
 * The `mnemo` shell wrapper (bin/mnemo.js) also launches the Electron GUI when not using these subcommands.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import type { INoteStore, Note } from '../shared/types';
import { runMcpStdioServer, parseMcpStdioArgs } from './mcp/stdio-bootstrap';
import { defaultLocalDataDir, resolveTursoCredentials } from './userConfig';

function printHelp(): void {
  console.log(`Mnemo CLI (Node)

Usage:
  mnemo mcp [options]        MCP server on stdio (Cursor, Claude Desktop, …)
  mnemo mcp-http             HTTP/SSE MCP (needs TURSO_URL, TURSO_AUTH_TOKEN, MCP_API_KEY)
  mnemo note <command> …     list | show | search | new

MCP options:
  --db <path>     SQLite database (default: ./mnemo.db, or MNEMO_HOME/mnemo.db for note)
  --vault <path>  Vault directory
  --turso-url / --turso-token   Turso instead of local SQLite

Note commands use XDG: ~/.local/share/mnemo/ unless MNEMO_HOME or --db/--vault is set.
If you configured Turso in the app Settings, the same credentials are read from config.json
(MNEMO_HOME, ~/.local/share/mnemo, or ~/.config/mnemo) or from MNEMO_TURSO_URL / MNEMO_TURSO_TOKEN.

  mnemo note list
  mnemo note show <ref | uuid>   ref = stable number from list (1-based)
  mnemo note search <query>
  mnemo note new --title "T" [--body "markdown"]

For the graphical app from a dev tree, run: mnemo   or   npm start
`);
}

function resolveBundledScript(name: 'mnemo-mcp-http.js'): string {
  const here = __dirname;
  const candidates = [
    path.join(here, name),
    path.join(here, '..', name),
    path.join(process.cwd(), 'dist', name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Could not find ${name}. Run: npm run build:mcp-http`);
}

/** Resolve numeric ref first, then UUID. */
async function resolveNoteForShow(store: INoteStore, arg: string): Promise<Note | null> {
  if (/^\d+$/.test(arg)) {
    const n = parseInt(arg, 10);
    const byRef = await store.readByRef(n);
    if (byRef) return byRef;
  }
  return store.read(arg);
}

function stripStoreArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (
      argv[i] === '--db' ||
      argv[i] === '--vault' ||
      argv[i] === '--turso-url' ||
      argv[i] === '--turso-token'
    ) {
      i++;
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

async function openStoreForNote(argv: string[]): Promise<INoteStore> {
  const parsed = parseMcpStdioArgs(argv);
  const hasDb = argv.includes('--db');
  const hasVault = argv.includes('--vault');
  const dbPath = hasDb ? parsed.dbPath : path.join(defaultLocalDataDir(), 'mnemo.db');
  const vaultPath = hasVault ? parsed.vaultPath : path.join(defaultLocalDataDir(), 'vault');

  const { tursoUrl, tursoToken } = resolveTursoCredentials(parsed);
  if (tursoUrl && tursoToken) {
    const turso = new TursoNoteStore(tursoUrl, tursoToken, vaultPath);
    await turso.initSchema();
    return turso;
  }
  return new LocalNoteStore(dbPath, vaultPath);
}

async function cmdNote(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);
  const store = await openStoreForNote(rest);
  const args = stripStoreArgs(rest);

  try {
    switch (sub) {
      case 'list': {
        const notes = await store.list();
        for (const n of notes) {
          console.log(`${n.ref}\t${n.modified}\t${n.title}\t${n.id}`);
        }
        break;
      }
      case 'show': {
        const id = args[0];
        if (!id) {
          console.error('Usage: mnemo note show <ref | uuid>');
          process.exit(1);
        }
        const note = await resolveNoteForShow(store, id);
        if (!note) {
          console.error('Note not found.');
          process.exit(1);
        }
        console.log(`# ${note.title}\n`);
        console.log(note.body);
        break;
      }
      case 'search': {
        const q = args.join(' ').trim();
        if (!q) {
          console.error('Usage: mnemo note search <query>');
          process.exit(1);
        }
        const hits = await store.search(q);
        for (const h of hits) {
          const snip = h.snippet.replace(/\s+/g, ' ').trim();
          console.log(`${h.ref}\t${h.rank}\t${h.title}\t${h.id}\n  ${snip}`);
        }
        break;
      }
      case 'new': {
        let title = '';
        let body = '';
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--title' && args[i + 1]) title = args[++i];
          else if (args[i] === '--body' && args[i + 1]) body = args[++i];
        }
        if (!title) {
          console.error('Usage: mnemo note new --title "Title" [--body "markdown"]');
          process.exit(1);
        }
        const note = await store.create({ title, body });
        console.log(`${note.ref}\t${note.id}`);
        break;
      }
      default:
        console.error('Unknown note subcommand. Use: list, show, search, new');
        process.exit(1);
    }
  } finally {
    store.close();
  }
}

function cmdMcpHttp(): void {
  const script = resolveBundledScript('mnemo-mcp-http.js');
  const child = spawn(process.execPath, [script], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '-h' || argv[0] === '--help') {
    printHelp();
    return;
  }

  const cmd = argv[0];
  const rest = argv.slice(1);

  if (cmd === 'mcp') {
    await runMcpStdioServer(rest);
    return;
  }

  if (cmd === 'mcp-http') {
    cmdMcpHttp();
    return;
  }

  if (cmd === 'note') {
    await cmdNote(rest);
    return;
  }

  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

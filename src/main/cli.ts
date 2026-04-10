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
import {
  GENERAL_PATH,
  categoryPathFromTags,
  filterNotesByCategory,
  normalizePath,
} from '../renderer/categoryPath';
import {
  parseCliCategoryPath,
  tagsForCategoryPath,
  printCategoryTree,
  setNoteCategory,
  renameCategoryFolder,
  promoteCategoryFolder,
  demoteCategoryFolder,
} from './cliCategory';
import { formatGraphOutput, parseGraphArgs } from './graphCli';
import { extractWikilinks } from '../shared/wikilinks';
import { inferLinkTargetIds, mergeOutgoingLinkTargets } from '../shared/linkInference';

function printHelp(): void {
  console.log(`Mnemo CLI (Node)

Usage:
  mnemo mcp [options]        MCP server on stdio (Cursor, Claude Desktop, …)
  mnemo mcp-http             HTTP/SSE MCP (needs TURSO_URL + TURSO_AUTH_TOKEN or LIBSQL_* aliases, MCP_API_KEY)
  mnemo note <command> …     list | show | search | new | import | graph | autolink | categories | set-category | category …

  mnemo note categories [--flat]
    Print folder tree (direct + subtree note counts). --flat: one path per line (tab-separated).

  mnemo note set-category <ref | uuid> <category>
    Set category (first tag). Use General, Unassigned, or a path like Work/Meetings.

  mnemo note category rename <oldPath> <newPath>
    Move every note in oldPath to newPath (same semantics as in-app Rename folder).

  mnemo note category promote <path>
    Move one level up (e.g. Work/Meetings → Meetings).

  mnemo note category demote <path> --under <parentPath>
    Nest path under parent (e.g. Work + Archive → Archive/Work).

MCP options:
  --db <path>     SQLite database (default: ./mnemo.db, or MNEMO_HOME/mnemo.db for note)
  --vault <path>  Vault directory
  --turso-url / --turso-token   Remote libSQL (Turso or self-hosted) instead of local SQLite

Note commands use XDG: ~/.local/share/mnemo/ unless MNEMO_HOME or --db/--vault is set.
If you configured a remote database in the app Settings, the same credentials are read from config.json
(MNEMO_HOME, ~/.local/share/mnemo, or ~/.config/mnemo) or from MNEMO_TURSO_URL / MNEMO_TURSO_TOKEN
or MNEMO_LIBSQL_URL / MNEMO_LIBSQL_AUTH_TOKEN.

  mnemo note list [--category|-c "path"] [--exact] [-v|--verbose]
    -c, --category      Only notes under this folder (General, Unassigned, Work/…, or nested paths)
    --exact, --shallow  With -c: exact folder only (no notes from subfolders)
    -v, --verbose       Include category column in output (matches in-app General / Unassigned / paths)
  mnemo note show <ref | uuid>   ref = stable number from list (1-based)
  mnemo note search <query>
  mnemo note new --title "T" [--body "markdown"] [--category|-c "path"]
    -c, --category    General, Unassigned, or nested path (same as set-category)

  mnemo note import <file> [--title "T"] [--category "path"]
    -t, --title       Note title (default: filename without extension, or "Imported note" for stdin)
    -c, --category    General, Unassigned, or nested path (stored as first tag; / for nesting)
    Use "-" as <file> to read body from stdin (e.g. cat x.md | mnemo note import - -c Docs)

  mnemo note graph [--format tree|edges|dot|mermaid|json]
    Link graph (wikilinks + inferred mentions). Default: ASCII tree. --format dot for graphviz.

  mnemo note autolink [--dry-run|-n]
    Recompute outgoing links for every note: [[wikilinks]] plus inferred title mentions (#ref, plain titles).

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

async function readStdinUtf8(): Promise<string> {
  if (process.stdin.isTTY) {
    console.error('Use a file path, or pipe content: cat note.md | mnemo note import -');
    process.exit(1);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseListArgs(args: string[]): {
  categoryPath: string | null;
  includeDescendants: boolean;
  verbose: boolean;
} {
  let categoryPath: string | null = null;
  let includeDescendants = true;
  let verbose = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-c' || a === '--category') {
      const v = args[++i];
      if (!v) {
        console.error(`Missing value for ${a}`);
        process.exit(1);
      }
      categoryPath = v;
      continue;
    }
    if (a === '--exact' || a === '--shallow' || a === '--no-descendants') {
      includeDescendants = false;
      continue;
    }
    if (a === '-r' || a === '--recursive') {
      includeDescendants = true;
      continue;
    }
    if (a === '-v' || a === '--verbose') {
      verbose = true;
      continue;
    }
    if (a?.startsWith('-')) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
    console.error('Unexpected argument to list');
    process.exit(1);
  }
  return { categoryPath, includeDescendants, verbose };
}

function parseNewArgs(args: string[]): { title: string; body: string; category?: string } {
  let title = '';
  let body = '';
  let category: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--title' && args[i + 1]) title = args[++i];
    else if (a === '--body' && args[i + 1]) body = args[++i];
    else if (a === '--category' || a === '-c') {
      const v = args[++i];
      if (!v) {
        console.error(`Missing value for ${a}`);
        process.exit(1);
      }
      category = v;
    } else if (a?.startsWith('-')) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  }
  return { title, body, category };
}

function parseDemoteArgs(args: string[]): { folderPath: string; parentPath: string } | null {
  if (args.length !== 3) return null;
  const folderPath = args[0];
  if (!folderPath || args[1] !== '--under') return null;
  const parentPath = args[2];
  if (!parentPath) return null;
  return { folderPath, parentPath };
}

function parseImportArgs(args: string[]): { file: string; title?: string; category?: string } {
  const positionals: string[] = [];
  let title: string | undefined;
  let category: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--title' || a === '-t') {
      const v = args[++i];
      if (!v) {
        console.error(`Missing value for ${a}`);
        process.exit(1);
      }
      title = v;
      continue;
    }
    if (a === '--category' || a === '-c') {
      const v = args[++i];
      if (!v) {
        console.error(`Missing value for ${a}`);
        process.exit(1);
      }
      category = v;
      continue;
    }
    if (a?.startsWith('-')) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
    positionals.push(a!);
  }
  if (positionals.length > 1) {
    console.error('Too many file arguments (expected one path or "-")');
    process.exit(1);
  }
  return { file: positionals[0] ?? '', title, category };
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
        const { categoryPath: catRaw, includeDescendants, verbose } = parseListArgs(args);
        let notes = await store.list();
        if (catRaw !== null) {
          const trimmed = catRaw.trim();
          const folderPath = trimmed ? normalizePath(trimmed) || GENERAL_PATH : GENERAL_PATH;
          notes = filterNotesByCategory(notes, folderPath, includeDescendants);
        }
        for (const n of notes) {
          if (verbose) {
            const cat = categoryPathFromTags(n.tags, notes);
            console.log(`${n.ref}\t${n.modified}\t${n.title}\t${cat}\t${n.id}`);
          } else {
            console.log(`${n.ref}\t${n.modified}\t${n.title}\t${n.id}`);
          }
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
        const { title, body, category } = parseNewArgs(args);
        if (!title) {
          console.error('Usage: mnemo note new --title "Title" [--body "markdown"] [--category|-c "path"]');
          process.exit(1);
        }
        let tags: string[] | undefined;
        if (category !== undefined) {
          tags = tagsForCategoryPath(parseCliCategoryPath(category), []);
        }
        const note = await store.create({ title, body, tags });
        console.log(`${note.ref}\t${note.id}`);
        break;
      }
      case 'import': {
        const { file, title: titleOpt, category: categoryRaw } = parseImportArgs(args);
        if (!file) {
          console.error(
            'Usage: mnemo note import <file> [--title|-t "Title"] [--category|-c "Folder/Subfolder"]\n' +
              '  <file> may be "-" to read body from stdin (pipe a file, not an interactive TTY).',
          );
          process.exit(1);
        }
        let body: string;
        let defaultTitle: string;
        if (file === '-') {
          body = await readStdinUtf8();
          defaultTitle = 'Imported note';
        } else {
          const fp = path.resolve(file);
          if (!fs.existsSync(fp)) {
            console.error(`File not found: ${fp}`);
            process.exit(1);
          }
          const stat = fs.statSync(fp);
          if (!stat.isFile()) {
            console.error(`Not a regular file: ${fp}`);
            process.exit(1);
          }
          body = fs.readFileSync(fp, 'utf-8');
          const ext = path.extname(fp);
          defaultTitle = path.basename(fp, ext) || 'Untitled';
        }
        const title = titleOpt?.trim() || defaultTitle;
        let tags: string[] | undefined;
        if (categoryRaw !== undefined) {
          tags = tagsForCategoryPath(parseCliCategoryPath(categoryRaw), []);
        } else {
          tags = [];
        }
        const note = await store.create({ title, body, tags });
        console.log(`${note.ref}\t${note.id}`);
        break;
      }
      case 'graph': {
        const { format } = parseGraphArgs(args);
        const list = await store.list();
        const links = await store.getAllLinks();
        const graphNodes = list.map(n => ({ id: n.id, ref: n.ref, title: n.title }));
        console.log(formatGraphOutput(format, graphNodes, links));
        break;
      }
      case 'categories': {
        let flat = false;
        const rest: string[] = [];
        for (const a of args) {
          if (a === '--flat') flat = true;
          else rest.push(a);
        }
        if (rest.length) {
          console.error('Usage: mnemo note categories [--flat]');
          process.exit(1);
        }
        const notes = await store.list();
        printCategoryTree(notes, flat);
        break;
      }
      case 'set-category': {
        if (args.length < 2) {
          console.error('Usage: mnemo note set-category <ref | uuid> <category>');
          process.exit(1);
        }
        const idArg = args[0]!;
        const categoryRaw = args.slice(1).join(' ').trim();
        if (!categoryRaw) {
          console.error('Usage: mnemo note set-category <ref | uuid> <category>');
          process.exit(1);
        }
        const idNote = await resolveNoteForShow(store, idArg);
        if (!idNote) {
          console.error('Note not found.');
          process.exit(1);
        }
        const vaultList = await store.list();
        await setNoteCategory(store, vaultList, idNote.id, categoryRaw);
        console.log('Updated category.');
        break;
      }
      case 'category': {
        const op = args[0];
        if (!op) {
          console.error('Usage: mnemo note category rename | promote | demote …');
          process.exit(1);
        }
        if (op === 'rename') {
          const oldP = args[1];
          const newP = args[2];
          if (!oldP || !newP) {
            console.error('Usage: mnemo note category rename <oldPath> <newPath>');
            process.exit(1);
          }
          await renameCategoryFolder(store, oldP, newP);
          break;
        }
        if (op === 'promote') {
          const p = args[1];
          if (!p) {
            console.error('Usage: mnemo note category promote <path>');
            process.exit(1);
          }
          await promoteCategoryFolder(store, p);
          break;
        }
        if (op === 'demote') {
          const parsed = parseDemoteArgs(args.slice(1));
          if (!parsed) {
            console.error('Usage: mnemo note category demote <path> --under <parentPath>');
            process.exit(1);
          }
          await demoteCategoryFolder(store, parsed.folderPath, parsed.parentPath);
          break;
        }
        console.error('Unknown category subcommand. Use: rename, promote, demote');
        process.exit(1);
      }
      case 'autolink': {
        let dryRun = false;
        for (const a of args) {
          if (a === '--dry-run' || a === '-n') dryRun = true;
        }
        const list = await store.list();
        const index = list.map((n) => ({ id: n.id, title: n.title, ref: n.ref }));
        let notesChanged = 0;
        let newEdges = 0;
        for (const item of list) {
          const note = await store.read(item.id);
          if (!note) continue;
          const explicitIds: string[] = [];
          for (const t of extractWikilinks(note.body)) {
            const r = await store.resolveTitle(t);
            if (r) explicitIds.push(r);
          }
          const inferredIds = inferLinkTargetIds(note.body, note.id, index);
          const merged = mergeOutgoingLinkTargets(explicitIds, inferredIds, note.id);
          const prev = new Set(note.links);
          const next = new Set(merged);
          const same =
            prev.size === next.size && [...prev].every((id) => next.has(id));
          if (same) continue;
          newEdges += merged.filter((id) => !prev.has(id)).length;
          notesChanged++;
          if (!dryRun) await store.updateLinks(note.id, merged);
        }
        console.log(
          dryRun
            ? `Dry run: ${notesChanged} note(s) would change (${newEdges} new outgoing link(s)); omit --dry-run to write.`
            : `Updated ${notesChanged} note(s); ${newEdges} new outgoing link edge(s) written.`,
        );
        break;
      }
        default:
        console.error(
          'Unknown note subcommand. Use: list, show, search, new, import, graph, autolink, categories, set-category, category …',
        );
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

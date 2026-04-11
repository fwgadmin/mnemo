#!/usr/bin/env node
/**
 * Node CLI bundle: MCP stdio, MCP HTTP (spawn), and note subcommands.
 * The `mnemo` shell wrapper (bin/mnemo.js) also launches the Electron GUI when not using these subcommands.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import type { INoteStore, Note, NoteListItem } from '../shared/types';
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
  exportCategoryTreeJson,
  setNoteCategory,
  renameCategoryFolder,
  promoteCategoryFolder,
  demoteCategoryFolder,
} from './cliCategory';
import { ensureDefaultCliConfig, loadCliConfig } from './cliConfig';
import { printCompletionScript } from './cliCompletion';
import { formatGraphOutput, parseGraphArgs } from './graphCli';
import { recomputeAutolinks } from './autolinkRecompute';
import { CLI_HELP_TOPICS, formatCliHelpOverview, formatCliHelpTopic } from '../shared/userGuide';
import { formatListLine, formatShowHuman } from './cliOutput';
import {
  createTempNoteFile,
  parseTitleBodyFile,
  removeTempDir,
  runEditorForPath,
} from './cliEditor';
import {
  DEFAULT_LIST_PAGE_SIZE,
  runInteractiveListPager,
} from './cliListPager';

function printHelp(rest: string[]): void {
  if (rest.length === 0) {
    console.log(formatCliHelpOverview());
    return;
  }
  const out = formatCliHelpTopic(rest[0]!);
  if (out === null) {
    console.error(
      `Unknown help topic "${rest[0]}". Valid: ${CLI_HELP_TOPICS.join(', ')}`,
    );
    process.exit(1);
  }
  console.log(out);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value));
}

/** Remove `--json` / `--no-json` from argv; last flag wins for the boolean. */
function stripJsonFlags(argv: string[]): { flag: boolean | null; argv: string[] } {
  const out: string[] = [];
  let flag: boolean | null = null;
  for (const a of argv) {
    if (a === '--json') {
      flag = true;
      continue;
    }
    if (a === '--no-json') {
      flag = false;
      continue;
    }
    out.push(a);
  }
  return { flag, argv: out };
}

/**
 * `--json` / `--no-json` > MNEMO_OUTPUT=json > ~/.config/mnemo/cli.json > text.
 */
function resolveJsonOutput(argv: string[]): { outJson: boolean; argv: string[] } {
  ensureDefaultCliConfig();
  const cfg = loadCliConfig();
  const { flag, argv: stripped } = stripJsonFlags(argv);
  let outJson: boolean;
  if (flag !== null) {
    outJson = flag;
  } else if (process.env.MNEMO_OUTPUT?.toLowerCase().trim() === 'json') {
    outJson = true;
  } else if (cfg.output === 'json') {
    outJson = true;
  } else {
    outJson = false;
  }
  return { outJson, argv: stripped };
}

function cmdCompletion(rest: string[]): void {
  const shell = rest[0];
  if (shell !== 'bash' && shell !== 'zsh' && shell !== 'fish') {
    console.error('Usage: mnemo completion bash|zsh|fish');
    process.exit(1);
  }
  printCompletionScript(shell);
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
  page: number;
  limit: number | null;
  showIds: boolean;
  explicitPage: boolean;
  explicitLimit: boolean;
  noPager: boolean;
  /** 1-based index into the sorted, filtered list (jump pager or slice). */
  fromOneBased: number | null;
  /** Interactive pager only; default in handler. */
  pagerSize: number | null;
} {
  let categoryPath: string | null = null;
  let includeDescendants = true;
  let verbose = false;
  let page = 1;
  let explicitPage = false;
  let limit: number | null = null;
  let explicitLimit = false;
  let showIds = false;
  let noPager = false;
  let fromOneBased: number | null = null;
  let pagerSize: number | null = null;
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
    if (a === '--ids') {
      showIds = true;
      continue;
    }
    if (a === '--no-pager' || a === '--plain') {
      noPager = true;
      continue;
    }
    if (a === '--pager-size') {
      const v = args[++i];
      const n = v ? parseInt(v, 10) : NaN;
      if (!v || !Number.isFinite(n) || n < 1) {
        console.error('Usage: --pager-size <positive integer>  (interactive TTY list only)');
        process.exit(1);
      }
      pagerSize = n;
      continue;
    }
    if (a === '--from') {
      const v = args[++i];
      const n = v ? parseInt(v, 10) : NaN;
      if (!v || !Number.isFinite(n) || n < 1) {
        console.error('Usage: --from <positive integer>  (1-based position in the sorted list)');
        process.exit(1);
      }
      fromOneBased = n;
      continue;
    }
    if (a === '--page') {
      explicitPage = true;
      const v = args[++i];
      const n = v ? parseInt(v, 10) : NaN;
      if (!v || !Number.isFinite(n) || n < 1) {
        console.error('Usage: --page <positive integer>');
        process.exit(1);
      }
      page = n;
      continue;
    }
    if (a === '--limit' || a === '--page-size') {
      explicitLimit = true;
      const v = args[++i];
      const n = v ? parseInt(v, 10) : NaN;
      if (!v || !Number.isFinite(n) || n < 1) {
        console.error('Usage: --limit <positive integer>');
        process.exit(1);
      }
      limit = n;
      continue;
    }
    if (a?.startsWith('-')) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
    console.error('Unexpected argument to list');
    process.exit(1);
  }
  if (explicitPage && !explicitLimit) {
    console.error('--page only applies with --limit (or --page-size).');
    process.exit(1);
  }
  return {
    categoryPath,
    includeDescendants,
    verbose,
    page,
    limit,
    showIds,
    explicitPage,
    explicitLimit,
    noPager,
    fromOneBased,
    pagerSize,
  };
}

/** Same category flags as list, plus query tokens (non-flag args). */
function parseSearchArgs(args: string[]): {
  queryParts: string[];
  categoryPath: string | null;
  includeDescendants: boolean;
} {
  const queryParts: string[] = [];
  let categoryPath: string | null = null;
  let includeDescendants = true;
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
    if (a?.startsWith('-')) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
    queryParts.push(a!);
  }
  return { queryParts, categoryPath, includeDescendants };
}

/** First non-empty line of body, trimmed and capped (for title when body-only). */
function deriveTitleFromBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return 'Untitled';
  const firstLine = (trimmed.split(/\r?\n/)[0] ?? '').trim();
  const line = firstLine || 'Untitled';
  const max = 80;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function parseNewArgs(args: string[]): { title: string; body: string; category?: string } {
  let title = '';
  let body = '';
  let category: string | undefined;
  const positionals: string[] = [];
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
    if (a === '--body' || a === '-b') {
      const v = args[++i];
      if (!v) {
        console.error(`Missing value for ${a}`);
        process.exit(1);
      }
      body = v;
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
    if (a) positionals.push(a);
  }

  if (title && body) {
    if (positionals.length) {
      console.error('Remove extra arguments when using both --title and --body.');
      process.exit(1);
    }
    return { title, body, category };
  }
  if (title && !body) {
    body = positionals.join('\n');
    return { title, body, category };
  }
  if (!title && body) {
    title = deriveTitleFromBody(body);
    if (positionals.length) {
      console.error('Use either --body/-b or a single positional body, not both.');
      process.exit(1);
    }
    return { title, body, category };
  }
  if (positionals.length === 0) {
    console.error(
      'Usage: mnemo add --title "Title" [--body "…"] [-c folder]\n' +
        '       mnemo add -t "Title" -b "…" [-c folder]\n' +
        '       mnemo add -b "…"   (title from first line of body)\n' +
        '       mnemo add "…"      (one argument = body; title from first line)\n' +
        '       mnemo add "Title" "body…"  (title, then body)',
    );
    process.exit(1);
  }
  if (positionals.length === 1) {
    const only = positionals[0]!;
    body = only;
    title = deriveTitleFromBody(only);
    return { title, body, category };
  }
  title = positionals[0]!;
  body = positionals.slice(1).join('\n');
  return { title, body, category };
}

function parseEditArgs(args: string[]): { refArg: string; category?: string } {
  let category: string | undefined;
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-c' || a === '--category') {
      const v = args[++i];
      if (!v) {
        console.error(`Missing value for ${a}`);
        process.exit(1);
      }
      category = v;
      continue;
    }
    if (a?.startsWith('-')) {
      console.error(`Unknown option for edit: ${a}`);
      process.exit(1);
    }
    positionals.push(a!);
  }
  if (positionals.length !== 1) {
    console.error(
      'Usage: mnemo edit <ref|uuid> [--category <folder path>]\n' +
        '  Folder is the first tag (General, Unassigned, or nested like Work/Meetings). Applied after you save in the editor.',
    );
    process.exit(1);
  }
  return { refArg: positionals[0]!, category };
}

function parseComposeCategoryFromArgs(args: string[]): string | undefined {
  let category: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-c' || a === '--category') {
      const v = args[++i];
      if (!v) {
        console.error(`Missing value for ${a}`);
        process.exit(1);
      }
      category = v;
      continue;
    }
    if (a?.startsWith('-')) {
      console.error(`Unknown option for compose: ${a}`);
      process.exit(1);
    }
    console.error(`Unexpected argument to compose: ${a}`);
    process.exit(1);
  }
  return category;
}

async function cmdComposeWithStore(
  store: INoteStore,
  outJson: boolean,
  args: string[],
): Promise<void> {
  const category = parseComposeCategoryFromArgs(args);
  const { dir, file } = createTempNoteFile('New note', '');
  try {
    const code = runEditorForPath(file);
    if (code !== 0) {
      console.error('Editor exited without saving (abort).');
      process.exit(1);
    }
    const content = fs.readFileSync(file, 'utf8');
    const { title, body } = parseTitleBodyFile(content);
    if (!title.trim()) {
      console.error('Aborted: empty title.');
      process.exit(1);
    }
    let tags: string[] | undefined;
    if (category !== undefined) {
      tags = tagsForCategoryPath(parseCliCategoryPath(category), []);
    }
    const note = await store.create({ title: title.trim(), body, tags });
    if (outJson) {
      printJson({ ref: note.ref, id: note.id, title: note.title });
    } else {
      console.log(formatListLine(note.ref, note.title));
    }
  } finally {
    removeTempDir(dir);
  }
}

async function cmdEditWithStore(
  store: INoteStore,
  outJson: boolean,
  idArg: string,
  categoryAfterSave?: string,
): Promise<void> {
  const note = await resolveNoteForShow(store, idArg);
  if (!note) {
    console.error('Note not found.');
    process.exit(1);
  }
  const { dir, file } = createTempNoteFile(note.title, note.body);
  try {
    const code = runEditorForPath(file);
    if (code !== 0) {
      console.error('Editor exited without saving (abort).');
      process.exit(1);
    }
    const content = fs.readFileSync(file, 'utf8');
    const { title, body } = parseTitleBodyFile(content);
    if (!title.trim()) {
      console.error('Aborted: empty title.');
      process.exit(1);
    }
    await store.update({ id: note.id, title: title.trim(), body });
    if (categoryAfterSave !== undefined) {
      const vaultList = await store.list();
      try {
        await setNoteCategory(store, vaultList, note.id, categoryAfterSave);
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    }
    const updated = await store.read(note.id);
    if (outJson) {
      const payload: Record<string, unknown> = {
        ok: true,
        id: note.id,
        ref: note.ref,
        title: updated?.title ?? title,
      };
      if (categoryAfterSave !== undefined) {
        const list = await store.list();
        payload.folder = categoryPathFromTags(updated?.tags ?? note.tags, list);
      }
      printJson(payload);
    } else {
      console.log(formatListLine(note.ref, title));
    }
  } finally {
    removeTempDir(dir);
  }
}

async function cmdCompose(argv: string[]): Promise<void> {
  const { outJson, argv: av } = resolveJsonOutput(argv);
  let tail = [...av];
  if (tail[0] === 'compose' || tail[0] === 'write') {
    tail = tail.slice(1);
  } else if (tail[0] === 'add' || tail[0] === 'a') {
    tail = tail.slice(1);
    const hasE = tail.includes('-e') || tail.includes('--edit');
    if (!hasE) {
      console.error('Usage: mnemo add -e | --edit   (same as mnemo compose)');
      process.exit(1);
    }
    tail = tail.filter((x) => x !== '-e' && x !== '--edit');
  } else {
    console.error('Internal error: cmdCompose');
    process.exit(1);
  }
  const store = await openStoreForNote(tail);
  const args = stripStoreArgs(tail);
  try {
    await cmdComposeWithStore(store, outJson, args);
  } finally {
    store.close();
  }
}

async function cmdEdit(argv: string[]): Promise<void> {
  const { outJson, argv: av } = resolveJsonOutput(argv);
  if (av[0] !== 'edit') {
    console.error('Internal error: cmdEdit');
    process.exit(1);
  }
  const tail = av.slice(1);
  const store = await openStoreForNote(tail);
  const args = stripStoreArgs(tail);
  const { refArg, category } = parseEditArgs(args);
  try {
    await cmdEditWithStore(store, outJson, refArg, category);
  } finally {
    store.close();
  }
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

/** Standard UUID v1–v8 shape (loose) for CLI disambiguation. */
function isUuidToken(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** Top-level shortcuts that map to vault (see bin/mnemo.js shouldRunVaultCli). */
const TOP_LEVEL_VAULT = new Set([
  'add',
  'a',
  'find',
  'f',
  'search',
  'import',
  'graph',
  'categories',
  'autolink',
  'list',
  'set-category',
  'category',
  'compose',
  'write',
  'edit',
]);

async function cmdRecent(argv: string[]): Promise<void> {
  const { outJson, argv: av } = resolveJsonOutput(argv);
  const store = await openStoreForNote(av);
  const rest = stripStoreArgs(av);
  if (rest.length) {
    console.error('Unexpected arguments (use mnemo --help)');
    process.exit(1);
  }
  try {
    let notes = await store.list();
    notes = [...notes].sort((a, b) => (a.modified < b.modified ? 1 : a.modified > b.modified ? -1 : 0));
    const top = notes.slice(0, 10);
    if (outJson) {
      printJson({
        notes: top.map((n) => ({
          ref: n.ref,
          modified: n.modified,
          title: n.title,
          id: n.id,
        })),
      });
    } else {
      for (const n of top) {
        console.log(formatListLine(n.ref, n.title));
      }
    }
  } finally {
    store.close();
  }
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

function noteJsonShow(note: Note): Record<string, unknown> {
  return {
    id: note.id,
    ref: note.ref,
    title: note.title,
    body: note.body,
    tags: note.tags,
    created: note.created,
    modified: note.modified,
    tenantId: note.tenantId,
    links: note.links,
    hideHeader: note.hideHeader,
  };
}

async function cmdNote(argv: string[]): Promise<void> {
  const { outJson, argv: noteArgv } = resolveJsonOutput(argv);
  const sub = noteArgv[0];
  const rest = noteArgv.slice(1);
  const store = await openStoreForNote(rest);
  const args = stripStoreArgs(rest);

  try {
    switch (sub) {
      case 'list': {
        const {
          categoryPath: catRaw,
          includeDescendants,
          verbose,
          page,
          limit,
          showIds,
          explicitPage,
          explicitLimit,
          noPager,
          fromOneBased,
          pagerSize,
        } = parseListArgs(args);
        if (outJson && fromOneBased != null) {
          console.error('--from cannot be used with --json.');
          process.exit(1);
        }
        if (fromOneBased != null && (explicitPage || explicitLimit)) {
          console.error('Do not combine --from with --page or --limit.');
          process.exit(1);
        }
        let notes = await store.list();
        if (catRaw !== null) {
          const trimmed = catRaw.trim();
          const folderPath = trimmed ? normalizePath(trimmed) || GENERAL_PATH : GENERAL_PATH;
          notes = filterNotesByCategory(notes, folderPath, includeDescendants);
        }
        const sorted = [...notes].sort((a, b) => {
          const cmp = a.modified < b.modified ? 1 : a.modified > b.modified ? -1 : 0;
          if (cmp !== 0) return cmp;
          return (a.ref ?? 0) - (b.ref ?? 0);
        });
        const total = sorted.length;

        const formatLine = (n: NoteListItem): string => {
          if (verbose) {
            const cat = categoryPathFromTags(n.tags, sorted);
            return `${formatListLine(n.ref, n.title)}\t${cat}\t${n.id}\t${n.modified}`;
          }
          if (showIds) {
            return `${formatListLine(n.ref, n.title)}\t${n.id}`;
          }
          return formatListLine(n.ref, n.title);
        };

        let contextLine = 'all notes';
        if (catRaw !== null) {
          const trimmed = catRaw.trim();
          const fp = trimmed ? normalizePath(trimmed) || GENERAL_PATH : GENERAL_PATH;
          contextLine = `folder: ${fp}`;
        }

        const useInteractive =
          !outJson &&
          !noPager &&
          !explicitPage &&
          !explicitLimit &&
          process.stdout.isTTY &&
          process.stdin.isTTY;

        const effectivePagerSize = pagerSize ?? DEFAULT_LIST_PAGE_SIZE;

        if (useInteractive) {
          const pages: string[][] = [];
          const refsPerPage: number[][] = [];
          if (total === 0) {
            pages.push([]);
            refsPerPage.push([]);
          } else {
            for (let i = 0; i < sorted.length; i += effectivePagerSize) {
              const chunk = sorted.slice(i, i + effectivePagerSize);
              pages.push(chunk.map(formatLine));
              refsPerPage.push(chunk.map((n) => n.ref));
            }
          }
          let initialPageIndex = 0;
          if (fromOneBased != null) {
            initialPageIndex = Math.floor((fromOneBased - 1) / effectivePagerSize);
            initialPageIndex = Math.min(Math.max(0, initialPageIndex), Math.max(0, pages.length - 1));
          }
          await runInteractiveListPager(
            pages,
            refsPerPage,
            {
              totalNotes: total,
              contextLine,
              initialPageIndex,
              pageSize: effectivePagerSize,
            },
            async (ref) => {
              await cmdEditWithStore(store, false, String(ref));
            },
          );
          break;
        }

        let toPrint = sorted;
        if (fromOneBased != null) {
          toPrint = sorted.slice(fromOneBased - 1);
        }

        const totalPages = limit != null ? Math.max(1, Math.ceil(toPrint.length / limit)) : 1;
        if (limit != null && page > totalPages) {
          console.error(`No page ${page} (only ${totalPages} page(s), ${toPrint.length} note(s)).`);
          process.exit(1);
        }
        const start = limit != null ? (page - 1) * limit : 0;
        const slice = limit != null ? toPrint.slice(start, start + limit) : toPrint;

        if (outJson) {
          const rows = slice.map((n) => {
            const row: Record<string, unknown> = {
              ref: n.ref,
              modified: n.modified,
              title: n.title,
              id: n.id,
            };
            if (verbose) {
              row.category = categoryPathFromTags(n.tags, sorted);
            }
            return row;
          });
          const payload: Record<string, unknown> = { notes: rows };
          if (limit != null) {
            payload.page = page;
            payload.pageSize = limit;
            payload.total = toPrint.length;
            payload.totalPages = totalPages;
          }
          printJson(payload);
        } else {
          for (const n of slice) {
            console.log(formatLine(n));
          }
          if (limit != null) {
            const from = toPrint.length === 0 ? 0 : start + 1;
            const to = start + slice.length;
            console.error(
              `— Page ${page}/${totalPages} · notes ${from}-${to} of ${toPrint.length} (${slice.length} on this page) —`,
            );
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
        if (outJson) {
          printJson({ note: noteJsonShow(note) });
        } else {
          console.log(formatShowHuman(note));
        }
        break;
      }
      case 'search': {
        const { queryParts, categoryPath: searchCat, includeDescendants: searchDesc } =
          parseSearchArgs(args);
        const q = queryParts.join(' ').trim();
        if (!q) {
          console.error(
            'Usage: mnemo note search <words…> [--category <folder>] [--exact|--shallow]\n' +
              '  Search titles and bodies. --category limits results to notes in that folder (nested paths use slashes, e.g. Work/Meetings).',
          );
          process.exit(1);
        }
        let hits = await store.search(q);
        if (searchCat !== null) {
          const fullList = await store.list();
          const trimmed = searchCat.trim();
          const folderPath = trimmed ? normalizePath(trimmed) || GENERAL_PATH : GENERAL_PATH;
          const allowed = new Set(
            filterNotesByCategory(fullList, folderPath, searchDesc).map((n) => n.id),
          );
          hits = hits.filter((h) => allowed.has(h.id));
        }
        if (outJson) {
          printJson({
            hits: hits.map((h) => ({
              ref: h.ref,
              rank: h.rank,
              title: h.title,
              id: h.id,
              snippet: h.snippet.replace(/\s+/g, ' ').trim(),
            })),
          });
        } else {
          for (const h of hits) {
            const snip = h.snippet.replace(/\s+/g, ' ').trim();
            console.log(formatListLine(h.ref, h.title));
            if (snip) {
              console.log(`  ${snip}`);
            }
          }
        }
        break;
      }
      case 'compose':
      case 'write': {
        await cmdComposeWithStore(store, outJson, args);
        break;
      }
      case 'edit': {
        const { refArg, category } = parseEditArgs(args);
        await cmdEditWithStore(store, outJson, refArg, category);
        break;
      }
      case 'new': {
        const hasEdit = args.includes('-e') || args.includes('--edit');
        if (hasEdit) {
          const filtered = args.filter((a) => a !== '-e' && a !== '--edit');
          await cmdComposeWithStore(store, outJson, filtered);
          break;
        }
        const { title, body, category } = parseNewArgs(args);
        if (!title.trim()) {
          console.error(
            'Usage: mnemo note new --title|-t "…" [--body|-b "…"] [-c folder]\n' +
              '  See: mnemo help vault (add / new)',
          );
          process.exit(1);
        }
        let tags: string[] | undefined;
        if (category !== undefined) {
          tags = tagsForCategoryPath(parseCliCategoryPath(category), []);
        }
        const note = await store.create({ title, body, tags });
        if (outJson) {
          printJson({ ref: note.ref, id: note.id, title: note.title });
        } else {
          console.log(formatListLine(note.ref, note.title));
        }
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
        if (outJson) {
          printJson({ ref: note.ref, id: note.id, title: note.title });
        } else {
          console.log(formatListLine(note.ref, note.title));
        }
        break;
      }
      case 'graph': {
        const { format } = parseGraphArgs(args);
        const list = await store.list();
        const links = await store.getAllLinks();
        const graphNodes = list.map(n => ({ id: n.id, ref: n.ref, title: n.title }));
        if (outJson) {
          printJson({ format, nodes: graphNodes, links });
        } else {
          console.log(formatGraphOutput(format, graphNodes, links));
        }
        break;
      }
      case 'categories': {
        let flat = false;
        const restCat: string[] = [];
        for (const a of args) {
          if (a === '--flat') flat = true;
          else restCat.push(a);
        }
        if (restCat.length) {
          console.error('Usage: mnemo note categories [--flat]');
          process.exit(1);
        }
        const notes = await store.list();
        if (outJson) {
          printJson({ flat, categories: exportCategoryTreeJson(notes, flat) });
        } else {
          printCategoryTree(notes, flat);
        }
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
        try {
          await setNoteCategory(store, vaultList, idNote.id, categoryRaw);
        } catch (e) {
          console.error(e instanceof Error ? e.message : String(e));
          process.exit(1);
        }
        if (outJson) {
          printJson({ ok: true, noteId: idNote.id });
        } else {
          console.log('Updated category.');
        }
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
          try {
            const r = await renameCategoryFolder(store, oldP, newP, { silent: outJson });
            if (outJson) {
              printJson({ ok: true, op: 'rename', ...r });
            }
          } catch (e) {
            console.error(e instanceof Error ? e.message : String(e));
            process.exit(1);
          }
          break;
        }
        if (op === 'promote') {
          const p = args[1];
          if (!p) {
            console.error('Usage: mnemo note category promote <path>');
            process.exit(1);
          }
          try {
            const r = await promoteCategoryFolder(store, p, { silent: outJson });
            if (outJson) {
              printJson({ ok: true, op: 'promote', ...r });
            }
          } catch (e) {
            console.error(e instanceof Error ? e.message : String(e));
            process.exit(1);
          }
          break;
        }
        if (op === 'demote') {
          const parsed = parseDemoteArgs(args.slice(1));
          if (!parsed) {
            console.error('Usage: mnemo note category demote <path> --under <parentPath>');
            process.exit(1);
          }
          try {
            const r = await demoteCategoryFolder(store, parsed.folderPath, parsed.parentPath, {
              silent: outJson,
            });
            if (outJson) {
              printJson({ ok: true, op: 'demote', ...r });
            }
          } catch (e) {
            console.error(e instanceof Error ? e.message : String(e));
            process.exit(1);
          }
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
        const { notesChanged, newEdges } = await recomputeAutolinks(store, dryRun);
        if (outJson) {
          printJson({ dryRun, notesChanged, newEdges });
        } else {
          console.log(
            dryRun
              ? `Dry run: ${notesChanged} note(s) would change (${newEdges} new outgoing link(s)); omit --dry-run to write.`
              : `Updated ${notesChanged} note(s); ${newEdges} new outgoing link edge(s) written.`,
          );
        }
        break;
      }
      default:
        console.error(
          'Unknown note subcommand. Use: list, show, search, new, compose, write, edit, import, graph, autolink, categories, set-category, category …',
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

/**
 * Real Node binary when the CLI runs as Electron-as-Node (`spawn('node', …)` fails if PATH has no `node`).
 */
function resolveNodeExecutable(): string {
  if (!process.versions.electron) {
    return process.execPath;
  }
  const isWin = process.platform === 'win32';
  try {
    const cmd = isWin ? 'where node' : 'command -v node';
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.trim().split(/\r?\n/)[0]?.trim();
    if (first && fs.existsSync(first)) {
      return first;
    }
  } catch {
    /* ignore */
  }
  return 'node';
}

/**
 * When this bundle is invoked as `electron dist/mnemo-cli.js gui` (Electron as Node),
 * `bin/mnemo.js` is not in the chain — re-exec the real entry so `mnemo gui` opens the app.
 */
function launchGuiFromCli(argv: string[]): void {
  const repoRoot = path.join(__dirname, '..');
  const wrapper = path.join(repoRoot, 'bin', 'mnemo.js');
  if (!fs.existsSync(wrapper)) {
    console.error('mnemo gui: missing bin/mnemo.js next to the CLI bundle (expected at ' + wrapper + ').');
    process.exit(1);
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const nodeBin = resolveNodeExecutable();
  const child = spawn(nodeBin, [wrapper, ...argv], {
    cwd: repoRoot,
    stdio: 'inherit',
    env,
  });
  child.on('error', (err) => {
    console.error('mnemo gui: could not run Node to launch the desktop app:', err.message);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv[0] === '-h' || argv[0] === '--help') {
    printHelp([]);
    return;
  }
  if (argv[0] === 'help') {
    printHelp(argv.slice(1));
    return;
  }

  if (argv.length === 0) {
    await cmdRecent(argv);
    return;
  }

  const cmd = argv[0]!;
  const rest = argv.slice(1);
  const cmdLc = cmd.toLowerCase();

  if (cmdLc === 'gui') {
    launchGuiFromCli(argv);
    return;
  }

  if (cmd === 'mcp') {
    await runMcpStdioServer(rest);
    return;
  }

  if (cmdLc === 'mcp-http') {
    cmdMcpHttp();
    return;
  }

  if (cmd === 'completion') {
    cmdCompletion(rest);
    return;
  }

  if (cmd === 'note') {
    await cmdNote(rest);
    return;
  }

  if (cmd === 'compose' || cmd === 'write') {
    await cmdCompose(argv);
    return;
  }

  if (cmd === 'edit') {
    await cmdEdit(argv);
    return;
  }

  if (TOP_LEVEL_VAULT.has(cmd) || /^\d+$/.test(cmd) || isUuidToken(cmd)) {
    if (/^\d+$/.test(cmd) || isUuidToken(cmd)) {
      await cmdNote(['show', ...argv]);
      return;
    }
    if (cmd === 'add' || cmd === 'a') {
      if (rest.includes('-e') || rest.includes('--edit')) {
        await cmdCompose(argv);
        return;
      }
      await cmdNote(['new', ...rest]);
      return;
    }
    if (cmd === 'find' || cmd === 'f' || cmd === 'search') {
      await cmdNote(['search', ...rest]);
      return;
    }
    await cmdNote([cmd, ...rest]);
    return;
  }

  if (argv.length === 1) {
    await cmdNote(['search', cmd]);
    return;
  }

  printHelp([]);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

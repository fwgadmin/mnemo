/**
 * Shared documentation: GUI (HelpView) and CLI (`mnemo --help`) stay in sync.
 * Edit tables here; HelpView imports rows, CLI formats plain text from the same data.
 */

export const USER_GUIDE_PATHS_HEADERS = ['OS', 'Database', 'Vault'] as const;

/** Default paths for GUI, CLI note commands, and reference for MCP --db/--vault. */
export const USER_GUIDE_PATHS_ROWS: string[][] = [
  ['Windows', '%APPDATA%\\Mnemo\\mnemo.db', '%APPDATA%\\Mnemo\\vault'],
  ['macOS', '~/Library/Application Support/Mnemo/mnemo.db', '~/Library/Application Support/Mnemo/vault'],
  ['Linux (Electron GUI)', '~/.config/Mnemo/mnemo.db', '~/.config/Mnemo/vault'],
  ['Linux (mnemo note CLI)', '~/.local/share/mnemo/mnemo.db', '~/.local/share/mnemo/vault'],
];

/** MCP stdio uses ./mnemo.db + ./vault in cwd unless --db / --vault are passed. */
export const MCP_STDIO_DEFAULT_NOTE =
  'MCP stdio without --db/--vault: SQLite ./mnemo.db and vault ./vault in the current working directory (not the same defaults as mnemo note).';

export const MCP_RESOURCES_HEADERS = ['URI', 'Description'] as const;
export const MCP_RESOURCES_ROWS: string[][] = [
  ['mnemo://notes', 'JSON list of all notes'],
  ['mnemo://notes/{id}', 'Single note content as Markdown'],
  [
    'mnemo://preferences',
    'UI preferences JSON (theme, layout, grouped categories, category colors) — same as Settings / ui-preferences.json',
  ],
];

export const MCP_TOOLS_HEADERS = ['Tool', 'Description'] as const;
export const MCP_TOOLS_ROWS: string[][] = [
  ['create_note', 'Create a note; optional tags (first tag = category path)'],
  ['read_note', 'Read a note by ID'],
  ['update_note', 'Update title, body, tags (first tag = category), hideHeader'],
  ['delete_note', 'Delete a note'],
  ['search_notes', 'Full-text search'],
  ['get_backlinks', 'Get notes linking to a given note'],
  ['link_notes', 'Set outgoing wikilinks from source to targets'],
  ['get_graph', 'Full note graph (nodes include id, title, ref; edges are links)'],
  ['get_ui_preferences', 'Read UI preferences from disk'],
  ['set_ui_preferences', 'Merge partial UI preferences (theme, layoutOverride, grouped, categoryColors, …)'],
];

export const MCP_PROMPTS_HEADERS = ['Prompt', 'Description'] as const;
export const MCP_PROMPTS_ROWS: string[][] = [
  ['summarize_note', 'Generate a concise summary of a note'],
  ['relate_notes', 'Analyze relationships between two notes'],
  ['query_vault', 'Answer a question using the full vault as context'],
];

export const MCP_CLIENT_CONFIG_HEADERS = ['Client', 'Config file'] as const;
export const MCP_CLIENT_CONFIG_ROWS: string[][] = [
  ['Claude Desktop (Windows)', '%APPDATA%\\Claude\\claude_desktop_config.json'],
  ['Claude Desktop (macOS)', '~/Library/Application Support/Claude/claude_desktop_config.json'],
  ['Cursor', '.cursor/mcp.json in your project, or global settings → MCP'],
  ['VS Code (Copilot)', '.vscode/mcp.json in your project'],
];

export const KEYBOARD_SHORTCUTS_HEADERS = ['Shortcut', 'Action'] as const;
export const KEYBOARD_SHORTCUTS_ROWS: string[][] = [
  ['Ctrl+N', 'New note'],
  ['Ctrl+S', 'Save immediately'],
  ['Ctrl+Shift+S', 'Save As (export .md)'],
  ['Ctrl+O', 'Open / import .md file'],
  ['Ctrl+P', 'Command palette'],
  ['Ctrl+G', 'Toggle graph view'],
  ['Ctrl+B', 'Toggle sidebar'],
  ['Ctrl+M', 'Toggle Markdown helper panel'],
  ['Ctrl+Shift+H', 'Toggle note header'],
  ['Ctrl+Shift+L', 'Toggle line numbers'],
  ['Ctrl+Shift+N', 'Toggle note index numbers (#refs)'],
  ['Ctrl+,', 'Settings (themes, layout)'],
];

function tableToPlainText(headers: readonly string[], rows: string[][]): string {
  const lines = [headers.join('  |  '), '-'.repeat(Math.min(80, headers.join('').length + 20))];
  for (const r of rows) {
    lines.push(r.join('  |  '));
  }
  return lines.join('\n');
}

/**
 * Full plain-text help for `mnemo --help` (same facts as in-app Documentation).
 */
export function formatCliHelpText(): string {
  const paths = tableToPlainText(USER_GUIDE_PATHS_HEADERS, USER_GUIDE_PATHS_ROWS);
  const mcpRes = tableToPlainText(MCP_RESOURCES_HEADERS, MCP_RESOURCES_ROWS);
  const mcpTools = tableToPlainText(MCP_TOOLS_HEADERS, MCP_TOOLS_ROWS);
  const mcpPrompts = tableToPlainText(MCP_PROMPTS_HEADERS, MCP_PROMPTS_ROWS);
  const mcpClients = tableToPlainText(MCP_CLIENT_CONFIG_HEADERS, MCP_CLIENT_CONFIG_ROWS);
  const shortcuts = tableToPlainText(KEYBOARD_SHORTCUTS_HEADERS, KEYBOARD_SHORTCUTS_ROWS);

  return `Mnemo — CLI help (synced with in-app Help → Documentation)

WHAT IS MNEMO
  Local-first notes in SQLite with FTS5; markdown mirror in a vault directory. Optional libSQL
  (Turso / self-hosted). MCP exposes the vault to AI clients over stdio or (for HTTP) remote libSQL.

DATA LOCATIONS (GUI + CLI)
${paths}

  ${MCP_STDIO_DEFAULT_NOTE}
  Set MNEMO_HOME to your app userData folder so mnemo note, mnemo mcp, and the GUI share one vault.

REMOTE DATABASE (CLI / MCP / GUI)
  Same precedence: --turso-url / --turso-token, then config.json (from GUI Settings), then
  MNEMO_TURSO_URL, MNEMO_TURSO_TOKEN (or MNEMO_LIBSQL_URL / MNEMO_LIBSQL_AUTH_TOKEN).

USAGE
  mnemo mcp [options]              MCP server on stdio (spawns separate process; not the GUI)
  mnemo mcp-http                   HTTP/SSE MCP (requires TURSO_* + MCP_API_KEY; see below)
  mnemo note <command> [args…]     Vault commands (below)
  mnemo completion bash|zsh|fish Print a tab-completion script to stdout (source or save it)

  From repo: mnemo | mnemo gui | mnemo note … | mnemo mcp …
  mcp-http is only: mnemo mcp-http (handled by bin/mnemo.js).

CLI CONFIG (optional)
  Default file: ~/.config/mnemo/cli.json (Linux/macOS) or %APPDATA%\\Mnemo\\cli.json (Windows).
  Created automatically on first run if missing. Fields: { "output": "text" | "json" }.
  JSON output for mnemo note also respects --json / --no-json (last wins) and MNEMO_OUTPUT=json.

NOTE COMMANDS
  Store selection uses the same --db / --vault / Turso rules as MCP (stdio).
  Optional JSON: append --json (or set config / MNEMO_OUTPUT=json). Use --no-json to force text.

  mnemo note list [-c|--category "path"] [--exact|--shallow|--no-descendants] [-r|--recursive] [-v|--verbose] [--json|--no-json]
    Tab-separated: ref, modified, title, id [+ category if -v].
    -c       Filter by folder: General, Unassigned, or nested path (Work/Meetings).
    --exact  With -c: this folder only, not subfolders.
    --no-descendants  Alias for --exact / --shallow.
    -r, --recursive   With -c: include subfolders (re-enable descendants).
    -v       Include category column (matches GUI folder names).

  mnemo note show <ref|uuid>
    Print one note (markdown body). ref is the stable # from list.

  mnemo note search <query…>
    Full-text search; prints ref, rank, title, id, snippet.

  mnemo note new --title "…" [--body "…"] [-c|--category "path"]
    Create a note. Category sets the first tag (folder).

  mnemo note import <file> [-t|--title "…"] [-c|--category "path"]
    Import file as body; use "-" as file to read stdin (pipe, not TTY).

  mnemo note graph [--format tree|edges|dot|mermaid|json]
    Wikilink + inferred link graph. Default: tree.

  mnemo note autolink [-n|--dry-run]
    Recompute stored outgoing links for all notes from [[wikilinks]] and mentions.

  mnemo note categories [--flat]
    Folder tree with counts; --flat: one path per line (tab-separated).

  mnemo note set-category <ref|uuid> <category>
    Set folder (first tag): General, Unassigned, or nested path.

  mnemo note category rename <oldPath> <newPath>
  mnemo note category promote <path>
  mnemo note category demote <path> --under <parentPath>

  Categories: first tag = folder (General, Unassigned, or nested paths). Same semantics as the GUI.

MCP (stdio)
  mnemo mcp [--db <path>] [--vault <path>] [--turso-url …] [--turso-token …]
  Defaults if omitted: ./mnemo.db and ./vault in the current working directory. For the same DB as
  the GUI, pass explicit paths from the table above or set MNEMO_HOME and use:
    --db "$MNEMO_HOME/mnemo.db" --vault "$MNEMO_HOME/vault"

MCP (HTTP/SSE)
  mnemo mcp-http    (needs dist/mnemo-mcp-http.js)
  Requires: TURSO_URL + TURSO_AUTH_TOKEN (or LIBSQL_*), MCP_API_KEY. Optional: PORT (default 3001).
  Remote libSQL only — not for local SQLite.

MCP RESOURCES (stdio server)
${mcpRes}

MCP TOOLS (stdio server)
${mcpTools}

MCP PROMPTS (templates for your client LLM — Mnemo does not run the model)
${mcpPrompts}

CONNECTING MCP CLIENTS
  Clients spawn a subprocess; they do not attach to the running GUI window.
${mcpClients}

  Published npm package: use command "mnemo", args ["mcp"] (and optional --db/--vault) so Electron
  runs the bundled CLI. From source you can also use node dist/mnemo-mcp.js with the same args.

DESKTOP APP
  mnemo / mnemo gui     Start Electron (dev: electron-forge start)
  npm start

GUI KEYBOARD SHORTCUTS (reference)
${shortcuts}

MORE
  Repository examples/: CLI, MCP, GUI. In-app: Help → Documentation for wikilinks, categories UI,
  graph, themes, and Markdown syntax.
`;
}

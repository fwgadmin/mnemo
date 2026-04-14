/**
 * Shared documentation: GUI (HelpView) imports tables from here; CLI help is progressive
 * (overview + `mnemo help <topic>`).
 */

export const USER_GUIDE_PATHS_HEADERS = ['OS', 'Database', 'Vault'] as const;

/** Default paths for GUI, CLI note commands, and reference for MCP --db/--vault. */
export const USER_GUIDE_PATHS_ROWS: string[][] = [
  ['Windows', '%APPDATA%\\mnemo-note\\mnemo.db', '…\\vault (same folder as bootstrap userData)'],
  ['macOS', '~/Library/Application Support/mnemo-note/mnemo.db', '…/vault'],
  ['Linux (GUI + mnemo CLI)', '~/.config/mnemo-note/mnemo.db', '…/vault'],
  ['Override', 'Set MNEMO_HOME to a folder; single mnemo.db at that root', ''],
];

/** MCP stdio without --db: same bootstrap paths as `mnemo note` (MNEMO_HOME / default userData), not cwd ./mnemo.db. */
export const MCP_STDIO_DEFAULT_NOTE =
  'MCP stdio without --db/--turso: uses the same bootstrap SQLite as mnemo note (see DATA LOCATIONS). Pass --workspace <id|index> to match a GUI vault when using the shared database.';

export const MCP_RESOURCES_HEADERS = ['URI', 'Description'] as const;
export const MCP_RESOURCES_ROWS: string[][] = [
  ['mnemo://notes', 'JSON list of notes in the active MCP workspace (tenant scope)'],
  ['mnemo://notes/{id}', 'Single note content as Markdown'],
  [
    'mnemo://preferences',
    'Merged UI preferences for the active workspace (disk + Turso app_kv); namespaced per workspace id like the Settings UI',
  ],
];

export const MCP_TOOLS_HEADERS = ['Tool', 'Description'] as const;
export const MCP_TOOLS_ROWS: string[][] = [
  ['create_note', 'Create a note; optional tags (first tag = category path)'],
  ['read_note', 'Read a note by UUID id or numeric ref'],
  ['update_note', 'Update title, body, tags, hideHeader (target by id or ref)'],
  ['delete_note', 'Delete by id or ref'],
  ['search_notes', 'Full-text search'],
  ['list_notes', 'List notes with optional category filter and page/limit'],
  ['get_categories', 'Category tree with counts (like mnemo note categories)'],
  ['set_note_category', 'Move a note to a folder (id or ref + category path)'],
  ['rename_category', 'Rename a category folder for all notes in it'],
  ['promote_category', 'Move a category one level up'],
  ['demote_category', 'Nest a category under a parent folder'],
  ['resolve_note_title', 'Resolve a title string to note UUID'],
  ['recompute_autolinks', 'Refresh outgoing links from wikilinks + inference'],
  ['get_backlinks', 'Get notes linking to a given note (id or ref)'],
  ['link_notes', 'Set outgoing wikilinks from source to targets'],
  ['get_graph', 'Full note graph (nodes include id, title, ref; edges are links)'],
  [
    'get_ui_preferences',
    'Read merged UI prefs for the active workspace (same scope as Settings; per-workspace when using shared DB + profiles)',
  ],
  [
    'set_ui_preferences',
    'Merge partial UI prefs for the active workspace (theme, layout, Markdown overrides, IDE tab order, …)',
  ],
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
  ['Ctrl+O', 'Import .md file into vault'],
  ['Ctrl+Shift+O', 'Open file as editor tab (filesystem)'],
  ['Ctrl+P', 'Command palette'],
  ['Ctrl+G', 'Toggle graph view'],
  ['Ctrl+B', 'Toggle sidebar'],
  ['F11', 'Toggle fullscreen (Linux / Windows; macOS: View menu or F11)'],
  ['Ctrl+M', 'Toggle Markdown helper panel'],
  ['Ctrl+Shift+H', 'Toggle note header'],
  ['Ctrl+Shift+L', 'Toggle line numbers'],
  ['Ctrl+Shift+N', 'Toggle note index numbers (#refs)'],
  ['Ctrl+,', 'Settings (General, Markdown, Workspace, Database tabs)'],
];

function tableToPlainText(headers: readonly string[], rows: string[][]): string {
  const lines = [headers.join('  |  '), '-'.repeat(Math.min(80, headers.join('').length + 20))];
  for (const r of rows) {
    lines.push(r.join('  |  '));
  }
  return lines.join('\n');
}

/** Valid second arguments to \`mnemo help <topic>\`. */
export const CLI_HELP_TOPICS = [
  'topics',
  'vault',
  'workspace',
  'sync',
  'note',
  'mcp',
  'mcp-http',
  'config',
  'clients',
  'desktop',
  'full',
] as const;

export type CliHelpTopic = (typeof CLI_HELP_TOPICS)[number];

/**
 * Default \`mnemo\` / \`mnemo --help\`: CLI-first, short; no GUI (see \`mnemo help desktop\`).
 */
export function formatCliHelpOverview(): string {
  return `Mnemo — command-line notes

GET STARTED
  mnemo                  Last 10 notes (by modified time)
  mnemo add -t "Title" -b "…"   New note with title and body (see mnemo help vault)
  mnemo add "…"          One argument = body; title = first line of body
  mnemo compose          Long-form create in $EDITOR / nano (alias: mnemo write; or mnemo add -e)
  mnemo edit <ref>       Edit in your editor; optional --category to set folder after save
  mnemo list             Interactive list (↑↓ Enter editor ←→ pages q); optional --pager-size; optional --category
  mnemo find <words>     Search vault (short: mnemo f …); optional --category Work to limit to that folder
  mnemo <ref>            Show note by number (from list output)
  mnemo <uuid>           Show note by id
  mnemo <word>           If one word and not a command → same as find

OTHER COMMANDS
  mnemo workspace …      List / create / switch / archive / delete vault profiles (see mnemo help workspace)
  mnemo sync push|pull   Additive merge with remote libSQL (local↔bootstrap DB; see mnemo help sync)
  mnemo mcp              MCP server on stdio (editors / agents; optional --workspace)
  mnemo mcp-http         Remote HTTP MCP (Turso / libSQL)
  mnemo completion …     Shell tab-completion script
  mnemo note …           Advanced vault subcommands (legacy form; see mnemo help note)

  Global flags on note commands (after mnemo / before subcommands): --workspace <id|index>, --db, --vault,
  --turso-url, --turso-token (see mnemo help vault).

HELP SECTIONS (read these next)
  mnemo help topics      List section names
  mnemo help vault       Paths, --db/--vault, every vault command and flag
  mnemo help workspace   Vault profiles, tenant id, workspace-profiles.json, CLI commands
  mnemo help sync        mnemo sync push / pull, additive rules, GUI buttons
  mnemo help mcp         MCP stdio: options, resources, tools
  mnemo help config      ~/.config/mnemo/cli.json and JSON output
  mnemo help desktop     Graphical app and keyboard shortcuts
  mnemo help full        Everything in one screen (long)

Global options: -h, --help (this screen), mnemo help <section>
`;
}

function sectionDataLocations(): string {
  const paths = tableToPlainText(USER_GUIDE_PATHS_HEADERS, USER_GUIDE_PATHS_ROWS);
  return `DATA LOCATIONS
${paths}

  ${MCP_STDIO_DEFAULT_NOTE}
  Set MNEMO_HOME to your app userData folder so mnemo, mnemo mcp, and the graphical app share one database.

  Next to mnemo.db (same bootstrap folder):
    workspace-profiles.json     Active workspace id, vault names/ids, optional per-vault storage overrides
    config.json                 Global libSQL URL/token (Settings → Database tab); if missing remote creds here, the app may use workspaces/default/config.json
    ui-preferences.json         Default workspace UI state; ui-preferences.<workspaceId>.json for other vaults
  Workspaces use tenant_id = workspace id in the shared DB unless a profile uses dedicated SQLite/libSQL (tenant "default" in that file).

  Legacy ~/.config/mnemo may still apply when it holds Turso credentials and mnemo-note does not (same as the desktop app).
  CLI loads remote DB credentials from the same bootstrap folder first (then other paths) so Turso URL/token stay aligned with workspace-profiles.json and mnemo.db.
`;
}

function sectionRemoteDb(): string {
  return `REMOTE DATABASE (CLI / MCP)
  Same precedence: --turso-url / --turso-token, then config.json (from the app’s Settings), then
  MNEMO_TURSO_URL, MNEMO_TURSO_TOKEN (or MNEMO_LIBSQL_URL / MNEMO_LIBSQL_AUTH_TOKEN).
  Remote mode uses a flat vault folder under the bootstrap root (not workspaces/<id>/).
`;
}

function sectionSync(): string {
  return `SYNC (local ↔ remote libSQL)
  Non-destructive: no deletes on either side. Notes merge by id using newer \`updated_at\`; links use INSERT OR IGNORE only.

  CLI (same remote credential rules as \`mnemo help vault\` — config, env, or flags)
  mnemo sync push [--db <path>] [--workspace <id|index>] [--turso-url …] [--turso-token …]
    Upload rows from the local SQLite file into the remote database (same as Settings → Database → “Upload local database to remote”).
    Default file is the bootstrap \`mnemo.db\`; use --db to read a different SQLite file.
  mnemo sync pull [--db <path>] [--vault <path>] [--workspace <id|index>] [--turso-url …] [--turso-token …]
    Download remote rows into the local \`mnemo.db\` and refresh \`vault/<id>.md\` for touched notes (same as “Download”).
    Default target is bootstrap paths; use --db / --vault for another pair.

  Desktop (Settings → Database, when connected to libSQL)
    Upload local database to remote — push from this device’s \`mnemo.db\`.
    Download remote snapshot to local — pull into \`mnemo.db\` + vault mirror.

  JSON output includes \`direction\`, \`synced\`, \`skipped\` (pull only uses \`skipped\` for rows left unchanged).
`;
}

function sectionWorkspace(): string {
  return `WORKSPACE (vault profiles)
  Same bootstrap root as the GUI: MNEMO_HOME, or the default Electron userData for mnemo-note,
  with the same legacy ~/.config/mnemo redirect when that folder holds Turso credentials.

  Active workspace (in workspace-profiles.json) sets which tenant_id applies for inherit-mode vaults: tenant_id equals
  the profile id.   With Turso, the CLI merges this file with the remote app_kv copy (same as the desktop app) so the
  active workspace and tenant_id for list/search match your cloud data. Stale on-disk entries may still
  say dedicated SQLite while the merged list uses inherit — \`mnemo workspace list\` uses the merge when Turso is configured.
  Per-vault dedicated SQLite or libSQL URLs are stored in that JSON (edited
  in the GUI under Settings → Workspace tab → Storage…); there is no separate CLI subcommand for storage overrides.

  mnemo workspace list
    Prints columns: index (1-based), id, name, and which workspace is active. The index is a shortcut for switch and
    for --workspace on note/MCP/sync commands. When global Turso credentials are configured, lists the same merged
    workspace list as the desktop app (not disk-only), so storage overrides match the cloud.

  mnemo workspace new <name>
    Create an empty workspace profile. Does not change the active workspace (use switch). The graphical app can
    create a vault and switch in one step from the Workspace tab.

  mnemo workspace switch <id|index>
    Set the active workspace. <index> is the first column from \`mnemo workspace list\` (1-based). Commands below then
    use this vault without repeating --workspace:
    • mnemo note … / mnemo list / mnemo find … when --db is omitted (bootstrap DB)
    • mnemo mcp when --db is omitted (stdio MCP uses the same profiles file)

  mnemo workspace archive <id|index>
    Non-default, non-active workspace only; removes the profile and purges that workspace’s notes (and deletes
    dedicated SQLite files if the profile used dedicated storage).

  mnemo workspace delete <id|index>
    Same constraints as archive; permanent removal.

  Optional: --json / --no-json (see mnemo help config).
`;
}

function sectionVaultCommands(): string {
  return `VAULT COMMANDS (store: same --db / --vault / Turso as mnemo mcp)
  Without --db: uses bootstrap mnemo.db (see DATA LOCATIONS).
  --workspace <id|index>  Use this vault’s tenant for the command (id from workspace list, or 1-based index from the
                           first column of \`mnemo workspace list\`). If omitted, uses the active workspace (same as
                           \`mnemo workspace switch\`).
  With --db <path>  Opens that SQLite file only; tenant is always "default" inside that file (--workspace is ignored).

  Optional JSON: --json / --no-json, or MNEMO_OUTPUT / cli.json (see mnemo help config).

  SYNC — \`mnemo sync push\` / \`mnemo sync pull\`, Settings → Database, and merge rules: \`mnemo help sync\`.

  Short forms (preferred)
    mnemo list …           Same as mnemo note list …
    mnemo add …            Same as mnemo note new … (add -e opens editor; see compose below)
    mnemo compose …        Same as mnemo note compose …
    mnemo write …          Alias of compose
    mnemo edit …           Same as mnemo note edit …
    mnemo find …           Same as mnemo note search …
    mnemo import …         Same as mnemo note import …
    mnemo graph …          Link graph
    mnemo categories …     Folder tree
    mnemo autolink …       Recompute wikilinks
    mnemo set-category …
    mnemo category …       rename | promote | demote

  mnemo note list [--category <folder path>] [--exact|--shallow] [-v|--verbose] [--ids]
                  [--pager-size N] [--plain] [--from N] [--page N] [--limit N] [--json|--no-json]
    In a normal terminal, list opens an interactive pager (20 notes per page by default): ↑↓ move, Enter opens the note in your editor, ←→ change page, q quit. The visible rows scroll so the highlighted line stays on screen when the terminal is shorter than a page; pagination hints stay at the bottom.
    Sorted by modified time (newest first). [ref] is the id you pass to mnemo show / mnemo edit.
    --category, -c   Only notes in that folder. Paths nest with slashes (e.g. Work/Meetings). Same as the first tag in the app.
    --exact          With --category: this folder only, not subfolders.
    -v               Verbose: category, id, modified.
    --ids            Note id (uuid) on each line (for copy/paste).
    --pager-size N   Rows per page in the interactive pager only (default 20). Does not apply with --json/--limit scripting.
    --plain, --no-pager   Disables the interactive pager. Plain text / JSON output defaults to 20 rows per page unless you set --limit (use a large --limit to dump everything).
    --from N         1-based position in the sorted list: open the pager at the page containing that note, or with --plain start the slice at that note (still respects default --limit unless you pass --limit).
    --limit, --page-size   Page size for plain/JSON output (default 20 when not interactive). Use with --page for pagination.

  mnemo note show <ref|uuid>
    Print one note. ref is the stable # from list.

  mnemo note search <words…> [--category <folder>] [--exact|--shallow]
    Full-text search in titles and bodies. Optional --category limits hits to notes filed under that folder (paths use slashes; same rules as list).
    Text output: [ref] title plus a snippet line.

  mnemo note new | mnemo add
    --title|-t and --body|-b set title and body explicitly.
    --body|-b only: title is taken from the first line of the body (trimmed, max 80 chars).
    One positional: entire string is the body; title from first line of that body.
    Two or more positionals: first is title, rest joined with newlines is body.
    -c|--category sets folder (first tag).
    -e|--edit on new: open external editor instead (same as compose).

  mnemo compose | mnemo write | mnemo note compose | mnemo note write
    Create a note in an external editor. Editor: MNEMO_EDITOR, then VISUAL, then EDITOR;
    default nano (non-Windows) or notepad (Windows).
    Temp file format: line 1 = title, blank line 2, then Markdown body (or line 1 only with body
    following if there is no blank line — see implementation).
    Optional: -c|--category for folder. On non-zero editor exit, nothing is saved.

  mnemo edit <ref|uuid> [--category <folder>] | mnemo note edit …
    Edit title/body in your editor (temp file: line 1 title, blank line, then body). Save to write back.
    The editor file does not contain folder metadata — use --category to set or move the note’s folder (first tag)
    after save, same paths as compose (General, Unassigned, Work/Meetings, …). Or run mnemo set-category separately.

  mnemo note import <file> [-t|--title "…"] [-c|--category "path"]
    Import file as body; "-" reads stdin (pipe, not TTY).

  mnemo note graph [--format tree|edges|dot|mermaid|json]
    Wikilink + inferred links. Default: tree.

  mnemo note autolink [-n|--dry-run]
    Recompute stored outgoing links from [[wikilinks]] and mentions.

  mnemo note categories [--flat]
    Folder tree with counts; --flat: tab-separated paths.

  mnemo note set-category <ref|uuid> <category>
    Set folder (first tag) without opening an editor: General, Unassigned, or nested path.

  mnemo note category rename <oldPath> <newPath>
  mnemo note category promote <path>
  mnemo note category demote <path> --under <parentPath>

  Categories: first tag = folder (General, Unassigned, or nested paths).
`;
}

function sectionNoteLegacy(): string {
  return `LEGACY FORM: mnemo note <subcommand>
  Same behavior as the short commands (mnemo list = mnemo note list, etc.).
  Prefer top-level mnemo add / find / … when scripting; keep mnemo note for old scripts.
`;
}

function sectionMcpStdio(): string {
  const mcpRes = tableToPlainText(MCP_RESOURCES_HEADERS, MCP_RESOURCES_ROWS);
  const mcpTools = tableToPlainText(MCP_TOOLS_HEADERS, MCP_TOOLS_ROWS);
  const mcpPrompts = tableToPlainText(MCP_PROMPTS_HEADERS, MCP_PROMPTS_ROWS);
  return `MCP (stdio)
  mnemo mcp [--db <path>] [--vault <path>] [--turso-url …] [--turso-token …] [--workspace <id|index>]
  Without --db/--turso: uses the same bootstrap DB and workspace-profiles.json as the GUI (set MNEMO_HOME to match).
    --workspace <id|index>  Optional; same meaning as on mnemo note — pick tenant for shared DB. Omit to use active vault.
  With --db: opens only that file (--workspace ignored; tenant "default").
  With global Turso credentials (config.json or env): same remote DB as Settings → Database; --workspace still applies.

  Minimal client args (shared DB, active vault):  node …/mnemo-mcp.js
  Explicit file pair:  --db "$MNEMO_HOME/mnemo.db" --vault "$MNEMO_HOME/vault"

MCP RESOURCES (stdio server)
${mcpRes}

MCP TOOLS (stdio server)
${mcpTools}

MCP PROMPTS (templates for your client LLM — Mnemo does not run the model)
${mcpPrompts}
`;
}

function sectionMcpHttp(): string {
  return `MCP (HTTP/SSE)
  mnemo mcp-http    (needs dist/mnemo-mcp-http.js)
  Requires: TURSO_URL + TURSO_AUTH_TOKEN (or LIBSQL_*), MCP_API_KEY. Optional: PORT (default 3001).
  Remote libSQL only — not for local SQLite.
`;
}

function sectionConfig(): string {
  return `CLI CONFIG
  File: ~/.config/mnemo/cli.json (Linux/macOS) or %APPDATA%\\Mnemo\\cli.json (Windows).
  Created on first run if missing.

  Fields:
    "output": "text" | "json"     Default output style when no flag/env override
    "bareCommand": "recent" | "gui"   No-args mnemo: list 10 notes vs launch GUI (wrapper only)

  Override bare: MNEMO_CLI_BARE=recent|gui
  JSON output: --json / --no-json (last wins), MNEMO_OUTPUT=json, or cli.json output.

  Editor (compose / edit): MNEMO_EDITOR overrides VISUAL and EDITOR (standard Unix order after that).
`;
}

function sectionClients(): string {
  const mcpClients = tableToPlainText(MCP_CLIENT_CONFIG_HEADERS, MCP_CLIENT_CONFIG_ROWS);
  return `CONNECTING MCP CLIENTS
  Clients spawn a subprocess; they do not attach to a running app window.
${mcpClients}

  Published npm package: command "mnemo", args ["mcp"] (optional --db/--vault/--workspace/--turso-*) via Electron.

  Example args for the same vault as the GUI without listing paths:  "mcp"  (or "mcp", "--workspace", "my-vault-id")
  when MNEMO_HOME points at app userData.
`;
}

function sectionDesktop(): string {
  const shortcuts = tableToPlainText(KEYBOARD_SHORTCUTS_HEADERS, KEYBOARD_SHORTCUTS_ROWS);
  return `DESKTOP APP (optional)
  mnemo gui [args…]     Start the graphical app (dev: electron-forge start; pass args after --)
  npm start

  Default UI for new installs: Dark (IDE) — sidebar + editor with tabs. Change theme or layout in Settings (Ctrl+,).

  Settings (Ctrl+,) is organized into tabs:
    General     Theme, layout, note #refs, category color tips
    Markdown    Editor font/CSS variables for preview
    Workspace   Folder sync (markdown import), vault list, storage overrides, create/archive/delete vaults
    Database    libSQL URL/token, save/reconnect, upload + download (additive sync), hosted/self-hosted help

  In-app documentation: Help → Documentation (this file in the app).

  Vault switcher: menu bar (or File → New / Manage Vault Workspaces). Matches active workspace in workspace-profiles.json.

GUI KEYBOARD SHORTCUTS
${shortcuts}
`;
}

function sectionMore(): string {
  return `MORE
  Repository examples/: CLI, MCP, GUI. Richer UI help lives inside the app (Help → Documentation).
`;
}

/** Full reference in one string (mnemo help full). */
export function formatCliHelpFull(): string {
  return [
    formatCliHelpOverview(),
    '',
    '---',
    '',
    sectionDataLocations(),
    '',
    sectionRemoteDb(),
    '',
    sectionWorkspace(),
    '',
    sectionSync(),
    '',
    sectionVaultCommands(),
    '',
    sectionNoteLegacy(),
    '',
    sectionMcpStdio(),
    '',
    sectionMcpHttp(),
    '',
    sectionConfig(),
    '',
    sectionClients(),
    '',
    sectionDesktop(),
    '',
    sectionMore(),
  ].join('\n');
}

export function formatCliHelpTopicsIndex(): string {
  return `Help sections (mnemo help <name>)

  topics       This list
  vault        Paths, --db/--vault/--workspace, remote env, all note commands
  workspace    workspace-profiles.json, mnemo workspace …, tenants
  sync         mnemo sync push / pull, Settings buttons, merge rules
  note         Legacy mnemo note … only
  mcp          MCP stdio: --workspace, resources, tools, prompts
  mcp-http     MCP over HTTP/SSE
  config       cli.json and JSON output defaults
  clients      MCP client config files (Cursor, Claude, …)
  desktop      GUI: Settings tabs, vault switcher, shortcuts
  full         Entire reference (long)
`;
}

/**
 * Topic help, or null if unknown.
 */
export function formatCliHelpTopic(topic: string): string | null {
  const t = topic.trim().toLowerCase();
  switch (t) {
    case 'topics':
      return formatCliHelpTopicsIndex();
    case 'vault':
      return [sectionDataLocations(), sectionRemoteDb(), sectionVaultCommands()].join('\n');
    case 'workspace':
      return [sectionDataLocations(), sectionWorkspace()].join('\n');
    case 'sync':
      return [sectionDataLocations(), sectionRemoteDb(), sectionSync()].join('\n');
    case 'note':
      return sectionNoteLegacy();
    case 'mcp':
      return sectionMcpStdio();
    case 'mcp-http':
      return sectionMcpHttp();
    case 'config':
      return sectionConfig();
    case 'clients':
      return sectionClients();
    case 'desktop':
      return sectionDesktop();
    case 'full':
      return formatCliHelpFull();
    default:
      return null;
  }
}

/** @deprecated Use formatCliHelpOverview() or formatCliHelpTopic(). */
export function formatCliHelpText(): string {
  return formatCliHelpOverview();
}

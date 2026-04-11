/** Shared types for Mnemo */

export interface NoteFrontmatter {
  id: string;
  title: string;
  tags: string[];
  created: string;   // ISO 8601
  modified: string;   // ISO 8601
  tenantId: string;
  links: string[];    // IDs of linked notes
}

export interface Note {
  id: string;
  /** Stable human-friendly index per tenant (1-based), for CLI / links */
  ref: number;
  title: string;
  body: string;       // Markdown content (without frontmatter)
  tags: string[];
  created: string;
  modified: string;
  tenantId: string;
  links: string[];
  /** When true, editor omits the title row and metadata (per-note; global "Show note header" still applies when false). */
  hideHeader: boolean;
  /**
   * When set, this tab edits this path on disk (IDE file tabs). Not stored in the vault until synced/imported.
   * Tab id uses `encodeFileTabId(filePath)`.
   */
  filePath?: string;
}

export interface NoteListItem {
  ref: number;
  id: string;
  title: string;
  tags: string[];
  modified: string;
  snippet: string;    // First ~100 chars of body
  hideHeader?: boolean;
}

export interface SearchResult {
  ref: number;
  id: string;
  title: string;
  snippet: string;
  rank: number;
  hideHeader?: boolean;
}

export interface CreateNoteInput {
  title: string;
  body: string;
  tags?: string[];
  tenantId?: string;
  hideHeader?: boolean;
}

export interface UpdateNoteInput {
  id: string;
  title?: string;
  body?: string;
  tags?: string[];
  hideHeader?: boolean;
}

export interface GraphData {
  nodes: Array<{ id: string; title: string; ref: number }>;
  links: Array<{ source: string; target: string }>;
}

/** Result of a local→Turso sync operation */
export interface SyncResult {
  synced: number;
  skipped: number;
}

/**
 * Remote database credentials (userData/config.json).
 * Mnemo uses @libsql/client — same protocol for Turso Cloud, self-hosted libSQL/sqld on a VPS, etc.
 * `tursoUrl` / `tursoToken` are the canonical keys; `libsql*` are optional aliases for clarity.
 */
export interface AppConfig {
  /** libSQL database URL (Turso `libsql://…`, or `https://…` for many self-hosted servers) */
  tursoUrl?: string;
  /** Bearer / JWT token for the remote database */
  tursoToken?: string;
  /** Alias of tursoUrl — merged at startup; use either pair */
  libsqlUrl?: string;
  /** Alias of tursoToken */
  libsqlAuthToken?: string;
}

/** GUI layout override (Settings) — mirrors renderer */
export type LayoutOverridePreference = 'inherit' | 'sidebar' | 'top' | 'ide';

/**
 * Customizable UI state shared by the Electron app (via IPC), on-disk JSON
 * (`ui-preferences.json` next to config), and MCP tools (`get_ui_preferences` / `set_ui_preferences`).
 * When the app uses a remote libSQL (Turso) store, the merged snapshot is also written to `app_kv` under key `ui_preferences`.
 */
export interface MnemoUiPreferences {
  themeId?: string;
  layoutOverride?: LayoutOverridePreference;
  showSidebar?: boolean;
  showNoteHeader?: boolean;
  showLineNumbers?: boolean;
  showNoteRefs?: boolean;
  /** Group notes under category headers in the sidebar */
  grouped?: boolean;
  /** Include subfolders when filtering by category */
  categoryScopeSubtree?: boolean;
  /** Folder path → #hex color */
  categoryColors?: Record<string, string>;
  /**
   * Markdown editor appearance: CSS custom properties (--mnemo-editor-*, --mnemo-syntax-*).
   * `markdownGlobal` applies to every theme; `markdownByTheme[themeId]` merges on top for that theme.
   */
  markdownGlobal?: Record<string, string>;
  markdownByTheme?: Record<string, Record<string, string>>;
  /** Open note tab IDs in IDE layout (order preserved) */
  ideTabIds?: string[];
  /**
   * Optional absolute path to a project folder. Markdown files are imported into the vault (category `Workspace/…`)
   * and kept in sync via **File → Open Workspace Folder…** / **Sync workspace**.
   */
  workspaceFolder?: string;
}

/**
 * Cheap vault-wide stats for GUI polling (Turso / multi-device sync) without loading full list.
 * Fingerprint = counts + max timestamp + linkCount + contentBytes + appKvMaxUpdatedAt so body/title/tag edits
 * and app_kv changes (e.g. ui_preferences: category colors, theme) bump the snapshot, even if updated_at ties
 * or sync paths are quirky.
 */
export interface VaultSnapshot {
  noteCount: number;
  maxUpdatedAt: string | null;
  linkCount: number;
  /** Sum of LENGTH(body)+LENGTH(title)+LENGTH(tags) — changes when note text/metadata changes. */
  contentBytes: number;
  /**
   * Max `app_kv.updated_at` when using Turso (UI prefs JSON and other KV). Null for local SQLite (no app_kv).
   * When this changes, the GUI should re-read merged ui-preferences (disk + Turso).
   */
  appKvMaxUpdatedAt: string | null;
}

export function vaultFingerprint(s: VaultSnapshot): string {
  return `${s.noteCount}|${s.maxUpdatedAt ?? ''}|${s.linkCount}|${s.contentBytes}|${s.appKvMaxUpdatedAt ?? ''}`;
}

/** Async store interface implemented by both LocalNoteStore and TursoNoteStore */
export interface INoteStore {
  create(input: CreateNoteInput): Promise<Note>;
  read(id: string): Promise<Note | null>;
  /** Load by stable ref (same as list column); tenant defaults to "default". */
  readByRef(ref: number, tenantId?: string): Promise<Note | null>;
  update(input: UpdateNoteInput): Promise<Note | null>;
  delete(id: string): Promise<boolean>;
  list(tenantId?: string): Promise<NoteListItem[]>;
  search(query: string, tenantId?: string): Promise<SearchResult[]>;
  getBacklinks(noteId: string): Promise<NoteListItem[]>;
  updateLinks(sourceId: string, targetIds: string[]): Promise<void>;
  resolveTitle(title: string, tenantId?: string): Promise<string | null>;
  getAllLinks(tenantId?: string): Promise<Array<{ source: string; target: string }>>;
  /** Single round-trip: counts + max(updated_at) for vault change detection. */
  getVaultSnapshot(tenantId?: string): Promise<VaultSnapshot>;
  close(): void;
}

/** IPC channel names */
export const IPC = {
  NOTE_CREATE: 'note:create',
  NOTE_READ: 'note:read',
  NOTE_UPDATE: 'note:update',
  NOTE_DELETE: 'note:delete',
  NOTE_LIST: 'note:list',
  NOTE_VAULT_SNAPSHOT: 'note:vaultSnapshot',
  NOTE_SEARCH: 'note:search',
  NOTE_BACKLINKS: 'note:backlinks',
  NOTE_GRAPH: 'note:graph',
  NOTE_UPDATE_LINKS: 'note:updateLinks',
  NOTE_RESOLVE_TITLE: 'note:resolveTitle',
  // File operations
  FILE_SAVE_AS: 'file:saveAs',
  FILE_OPEN: 'file:open',
  /** Read/write a single file by absolute path (IDE filesystem-backed tabs; local-first). */
  FILE_READ_PATH: 'file:readPath',
  FILE_WRITE_PATH: 'file:writePath',
  FILE_OPENED_EXTERNALLY: 'file:openedExternally',
  // Config (remote libSQL URL + token; stored in userData/config.json)
  CONFIG_READ: 'config:read',
  CONFIG_SAVE: 'config:save',
  CONFIG_STORE_TYPE: 'config:storeType',
  CONFIG_SYNC_LOCAL: 'config:syncLocal',
  // UI preferences (disk + MCP)
  UI_PREFERENCES_READ: 'uiPreferences:read',
  UI_PREFERENCES_SAVE: 'uiPreferences:save',
  // Menu → renderer commands
  MENU_COMMAND: 'menu:command',
  /** Toggle BrowserWindow fullscreen (F11 on Linux/Windows — no app menu accelerators there). */
  WINDOW_TOGGLE_FULLSCREEN: 'window:toggleFullscreen',
  /** Pick a folder and import/sync markdown into the vault (`Workspace/…` categories). */
  WORKSPACE_CHOOSE_FOLDER: 'workspace:chooseFolder',
  WORKSPACE_SYNC: 'workspace:sync',
} as const;

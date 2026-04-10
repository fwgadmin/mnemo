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

/** Cloud/sync configuration stored in userData/config.json */
export interface AppConfig {
  tursoUrl?: string;
  tursoToken?: string;
}

/** GUI layout override (Settings) — mirrors renderer */
export type LayoutOverridePreference = 'inherit' | 'sidebar' | 'top' | 'ide';

/**
 * Customizable UI state shared by the Electron app (via IPC), on-disk JSON
 * (`ui-preferences.json` next to config), and MCP tools (`get_ui_preferences` / `set_ui_preferences`).
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
  /** IDE layout: open tab order */
  ideTabIds?: string[];
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
  close(): void;
}

/** IPC channel names */
export const IPC = {
  NOTE_CREATE: 'note:create',
  NOTE_READ: 'note:read',
  NOTE_UPDATE: 'note:update',
  NOTE_DELETE: 'note:delete',
  NOTE_LIST: 'note:list',
  NOTE_SEARCH: 'note:search',
  NOTE_BACKLINKS: 'note:backlinks',
  NOTE_GRAPH: 'note:graph',
  NOTE_UPDATE_LINKS: 'note:updateLinks',
  NOTE_RESOLVE_TITLE: 'note:resolveTitle',
  // File operations
  FILE_SAVE_AS: 'file:saveAs',
  FILE_OPEN: 'file:open',
  FILE_OPENED_EXTERNALLY: 'file:openedExternally',
  // Config (Turso credentials, stored in userData/config.json)
  CONFIG_READ: 'config:read',
  CONFIG_SAVE: 'config:save',
  CONFIG_STORE_TYPE: 'config:storeType',
  CONFIG_SYNC_LOCAL: 'config:syncLocal',
  // UI preferences (disk + MCP)
  UI_PREFERENCES_READ: 'uiPreferences:read',
  UI_PREFERENCES_SAVE: 'uiPreferences:save',
  // Menu → renderer commands
  MENU_COMMAND: 'menu:command',
} as const;

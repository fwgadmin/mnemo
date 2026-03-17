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
  title: string;
  body: string;       // Markdown content (without frontmatter)
  tags: string[];
  created: string;
  modified: string;
  tenantId: string;
  links: string[];
}

export interface NoteListItem {
  id: string;
  title: string;
  tags: string[];
  modified: string;
  snippet: string;    // First ~100 chars of body
}

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  rank: number;
}

export interface CreateNoteInput {
  title: string;
  body: string;
  tags?: string[];
  tenantId?: string;
}

export interface UpdateNoteInput {
  id: string;
  title?: string;
  body?: string;
  tags?: string[];
}

export interface GraphData {
  nodes: Array<{ id: string; title: string }>;
  links: Array<{ source: string; target: string }>;
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
} as const;

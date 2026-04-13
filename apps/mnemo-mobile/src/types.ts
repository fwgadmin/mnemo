/** Aligned with desktop [src/shared/types.ts] — vault note shapes only. */

export interface Note {
  id: string;
  ref: number;
  title: string;
  body: string;
  tags: string[];
  created: string;
  modified: string;
  tenantId: string;
  links: string[];
  hideHeader: boolean;
}

export interface NoteListItem {
  ref: number;
  id: string;
  title: string;
  tags: string[];
  modified: string;
  snippet: string;
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

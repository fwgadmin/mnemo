import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';
import type { Note, NoteListItem, SearchResult, CreateNoteInput, UpdateNoteInput, GraphData } from '../shared/types';

export interface MnemoAPI {
  notes: {
    create(input: CreateNoteInput): Promise<Note>;
    read(id: string): Promise<Note | null>;
    update(input: UpdateNoteInput): Promise<Note | null>;
    delete(id: string): Promise<boolean>;
    list(tenantId?: string): Promise<NoteListItem[]>;
    search(query: string, tenantId?: string): Promise<SearchResult[]>;
    getBacklinks(noteId: string): Promise<NoteListItem[]>;
    getGraph(tenantId?: string): Promise<GraphData>;
    updateLinks(sourceId: string, targetIds: string[]): Promise<void>;
    resolveTitle(title: string, tenantId?: string): Promise<string | null>;
  };
}

const api: MnemoAPI = {
  notes: {
    create: (input) => ipcRenderer.invoke(IPC.NOTE_CREATE, input),
    read: (id) => ipcRenderer.invoke(IPC.NOTE_READ, id),
    update: (input) => ipcRenderer.invoke(IPC.NOTE_UPDATE, input),
    delete: (id) => ipcRenderer.invoke(IPC.NOTE_DELETE, id),
    list: (tenantId) => ipcRenderer.invoke(IPC.NOTE_LIST, tenantId),
    search: (query, tenantId) => ipcRenderer.invoke(IPC.NOTE_SEARCH, query, tenantId),
    getBacklinks: (noteId) => ipcRenderer.invoke(IPC.NOTE_BACKLINKS, noteId),
    getGraph: (tenantId) => ipcRenderer.invoke(IPC.NOTE_GRAPH, tenantId),
    updateLinks: (sourceId, targetIds) => ipcRenderer.invoke(IPC.NOTE_UPDATE_LINKS, sourceId, targetIds),
    resolveTitle: (title, tenantId) => ipcRenderer.invoke(IPC.NOTE_RESOLVE_TITLE, title, tenantId),
  },
};

contextBridge.exposeInMainWorld('mnemo', api);

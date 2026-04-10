import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';
import type {
  Note,
  NoteListItem,
  SearchResult,
  CreateNoteInput,
  UpdateNoteInput,
  GraphData,
  AppConfig,
  SyncResult,
  MnemoUiPreferences,
} from '../shared/types';

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
  file: {
    saveAs(data: { title: string; body: string }): Promise<{ saved: boolean; filePath?: string }>;
    open(): Promise<Array<{ title: string; body: string }> | null>;
  };
  config: {
    read(): Promise<AppConfig>;
    save(cfg: AppConfig): Promise<boolean>;
    storeType(): Promise<'turso' | 'local'>;
    syncLocalNotes(): Promise<SyncResult>;
  };
  /** Theme, layout, sidebar, category colors — synced to ui-preferences.json (same as MCP) */
  preferences: {
    read(): Promise<MnemoUiPreferences>;
    save(partial: Partial<MnemoUiPreferences>): Promise<boolean>;
  };
  onMenuCommand(callback: (command: string) => void): () => void;
  onFileOpenedExternally(callback: (data: { title: string; body: string }) => void): () => void;
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
  file: {
    saveAs: (data) => ipcRenderer.invoke(IPC.FILE_SAVE_AS, data),
    open: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  },
  config: {
    read: () => ipcRenderer.invoke(IPC.CONFIG_READ),
    save: (cfg: AppConfig) => ipcRenderer.invoke(IPC.CONFIG_SAVE, cfg),
    storeType: () => ipcRenderer.invoke(IPC.CONFIG_STORE_TYPE),
    syncLocalNotes: (): Promise<SyncResult> => ipcRenderer.invoke(IPC.CONFIG_SYNC_LOCAL),
  },
  preferences: {
    read: () => ipcRenderer.invoke(IPC.UI_PREFERENCES_READ),
    save: (partial: Partial<MnemoUiPreferences>) => ipcRenderer.invoke(IPC.UI_PREFERENCES_SAVE, partial),
  },
  onMenuCommand: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, command: string) => callback(command);
    ipcRenderer.on(IPC.MENU_COMMAND, handler);
    return () => ipcRenderer.off(IPC.MENU_COMMAND, handler);
  },
  onFileOpenedExternally: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { title: string; body: string }) => callback(data);
    ipcRenderer.on(IPC.FILE_OPENED_EXTERNALLY, handler);
    return () => ipcRenderer.off(IPC.FILE_OPENED_EXTERNALLY, handler);
  },
};

contextBridge.exposeInMainWorld('mnemo', api);

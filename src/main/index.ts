import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { NoteStore } from './store/NoteStore';
import { IPC } from '../shared/types';
import type { CreateNoteInput, UpdateNoteInput } from '../shared/types';
import { createMcpServer } from './mcp/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let store: NoteStore;
let mcpServer: McpServer;

function initStore(): void {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'mnemo.db');
  const vaultPath = path.join(userDataPath, 'vault');
  store = new NoteStore(dbPath, vaultPath);
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Mnemo',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.NOTE_CREATE, (_event, input: CreateNoteInput) => {
    return store.create(input);
  });

  ipcMain.handle(IPC.NOTE_READ, (_event, id: string) => {
    return store.read(id);
  });

  ipcMain.handle(IPC.NOTE_UPDATE, (_event, input: UpdateNoteInput) => {
    return store.update(input);
  });

  ipcMain.handle(IPC.NOTE_DELETE, (_event, id: string) => {
    return store.delete(id);
  });

  ipcMain.handle(IPC.NOTE_LIST, (_event, tenantId?: string) => {
    return store.list(tenantId);
  });

  ipcMain.handle(IPC.NOTE_SEARCH, (_event, query: string, tenantId?: string) => {
    return store.search(query, tenantId);
  });

  ipcMain.handle(IPC.NOTE_BACKLINKS, (_event, noteId: string) => {
    return store.getBacklinks(noteId);
  });

  ipcMain.handle(IPC.NOTE_GRAPH, (_event, tenantId?: string) => {
    const notes = store.list(tenantId);
    const links = store.getAllLinks(tenantId);
    return {
      nodes: notes.map(n => ({ id: n.id, title: n.title })),
      links,
    };
  });

  ipcMain.handle(IPC.NOTE_UPDATE_LINKS, (_event, sourceId: string, targetIds: string[]) => {
    store.updateLinks(sourceId, targetIds);
  });

  ipcMain.handle(IPC.NOTE_RESOLVE_TITLE, (_event, title: string, tenantId?: string) => {
    return store.resolveTitle(title, tenantId);
  });
}

app.whenReady().then(() => {
  initStore();
  registerIpcHandlers();

  // Create MCP server (available for stdio entry point; lifecycle managed externally)
  mcpServer = createMcpServer(store);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  mcpServer?.close();
  store?.close();
});

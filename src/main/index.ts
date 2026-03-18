import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { NoteStore } from './store/NoteStore';
import { IPC } from '../shared/types';
import type { CreateNoteInput, UpdateNoteInput } from '../shared/types';
import { createMcpServer } from './mcp/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const matter = require('gray-matter');

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

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Mnemo',
    backgroundColor: '#0f0f0f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return mainWindow;
}

function buildMenu(mainWindow: BrowserWindow): void {
  const send = (cmd: string) => () => mainWindow.webContents.send(IPC.MENU_COMMAND, cmd);

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: send('new-note') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
        { type: 'separator' },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: send('toggle-sidebar') },
        { label: 'Toggle Note Header', accelerator: 'CmdOrCtrl+Shift+H', click: send('toggle-header') },
        { label: 'Toggle Line Numbers', accelerator: 'CmdOrCtrl+Shift+L', click: send('toggle-line-numbers') },
        { type: 'separator' },
        { label: 'Toggle Graph', accelerator: 'CmdOrCtrl+G', click: send('toggle-graph') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: send('show-help') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

  ipcMain.handle(IPC.FILE_SAVE_AS, async (_event, { title, body }: { title: string; body: string }) => {
    const result = await dialog.showSaveDialog({
      title: 'Save Note As',
      defaultPath: `${title || 'note'}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, `# ${title}\n\n${body}`, 'utf-8');
    return { saved: true, filePath: result.filePath };
  });

  ipcMain.handle(IPC.FILE_OPEN, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Markdown File',
      filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths.map((fp: string) => {
      const content = fs.readFileSync(fp, 'utf-8');
      const parsed = matter(content);
      const title = (parsed.data.title as string) || path.basename(fp, path.extname(fp));
      return { title, body: (parsed.content as string).trim() };
    });
  });
}

app.whenReady().then(() => {
  initStore();
  registerIpcHandlers();

  // Create MCP server (available for stdio entry point; lifecycle managed externally)
  mcpServer = createMcpServer(store);

  const mainWindow = createWindow();
  buildMenu(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      buildMenu(w);
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

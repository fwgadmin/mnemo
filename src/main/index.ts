import { app, BrowserWindow, ipcMain, Menu, dialog, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

// Load .env from the repo root if present (dev mode cloud config)
try {
  (process as NodeJS.Process & { loadEnvFile(path?: string): void }).loadEnvFile(
    path.join(__dirname, '..', '..', '.env'),
  );
} catch {
  // .env is optional — ignore if absent
}
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import type { INoteStore } from '../shared/types';
import { IPC } from '../shared/types';
import type { CreateNoteInput, UpdateNoteInput } from '../shared/types';
import { createMcpServer } from './mcp/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const matter = require('gray-matter');

// ─── Windows shell registration (Squirrel install/uninstall hooks) ─────────────

function registerShellAssociations(exePath: string): void {
  for (const ext of ['.md', '.txt']) {
    const key = `HKCU\\Software\\Classes\\${ext}\\shell\\Open in Mnemo`;
    spawnSync('reg', ['add', key, '/ve', '/d', 'Open in Mnemo', '/f']);
    spawnSync('reg', ['add', `${key}\\command`, '/ve', '/d', `"${exePath}" "%1"`, '/f']);
  }
}

function deregisterShellAssociations(): void {
  for (const ext of ['.md', '.txt']) {
    spawnSync('reg', ['delete', `HKCU\\Software\\Classes\\${ext}\\shell\\Open in Mnemo`, '/f']);
  }
}

// Run shell registration BEFORE electron-squirrel-startup handles events (and quits)
if (process.platform === 'win32') {
  const squirrelEvent = process.argv[1];
  if (squirrelEvent === '--squirrel-install' || squirrelEvent === '--squirrel-updated') {
    registerShellAssociations(process.execPath);
  } else if (squirrelEvent === '--squirrel-uninstall') {
    deregisterShellAssociations();
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// ─── External file handling ────────────────────────────────────────────────────

/** File path queued before the window finishes loading (macOS open-file, fast Windows launch) */
let pendingExternalFile: string | null = null;

/** Parse a markdown/text file and send it to the renderer as a new note import. */
function sendFileToRenderer(win: BrowserWindow, filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(content);
    const title = (parsed.data.title as string) || path.basename(filePath, path.extname(filePath));
    const body = (parsed.content as string).trim();
    win.webContents.send(IPC.FILE_OPENED_EXTERNALLY, { title, body });
  } catch {
    // Ignore unreadable files
  }
}

/** Return a file path passed from the OS shell (Windows right-click / open-with). */
function getArgvFilePath(): string | null {
  // Packaged: argv = [exe, ...args]  Dev: argv = [electron, script, ...args]
  const args = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
  const filePath = args.find(
    a => !a.startsWith('-') && (a.endsWith('.md') || a.endsWith('.txt')) && fs.existsSync(a),
  );
  return filePath ?? null;
}

// macOS: file opened via Finder "Open with" or drag-onto-dock
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0 && wins[0].webContents) {
    sendFileToRenderer(wins[0], filePath);
  } else {
    pendingExternalFile = filePath;
  }
});

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let store: INoteStore;
let mcpServer: McpServer;

async function initStore(): Promise<void> {
  const tursoUrl = process.env['MNEMO_TURSO_URL'];
  const tursoToken = process.env['MNEMO_TURSO_TOKEN'];
  if (tursoUrl && tursoToken) {
    const turso = new TursoNoteStore(tursoUrl, tursoToken);
    await turso.initSchema();
    store = turso;
  } else {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'mnemo.db');
    const vaultPath = path.join(userDataPath, 'vault');
    store = new LocalNoteStore(dbPath, vaultPath);
  }
}

function createWindow(): BrowserWindow {
  const iconPath = path.join(__dirname, '..', '..', 'src', 'assets',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const appIcon = nativeImage.createFromPath(iconPath);

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Mnemo',
    icon: appIcon.isEmpty() ? undefined : appIcon,
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
        { label: 'Markdown Helper', accelerator: 'CmdOrCtrl+M', click: send('toggle-markdown-help') },
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

  ipcMain.handle(IPC.NOTE_GRAPH, async (_event, tenantId?: string) => {
    const [notes, links] = await Promise.all([store.list(tenantId), store.getAllLinks(tenantId)]);
    return {
      nodes: notes.map(n => ({ id: n.id, title: n.title })),
      links,
    };
  });

  ipcMain.handle(IPC.NOTE_UPDATE_LINKS, (_event, sourceId: string, targetIds: string[]) => {
    return store.updateLinks(sourceId, targetIds);
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

app.whenReady().then(async () => {
  await initStore();
  registerIpcHandlers();

  // Create MCP server (available for stdio entry point; lifecycle managed externally)
  mcpServer = createMcpServer(store);

  const mainWindow = createWindow();
  buildMenu(mainWindow);

  // Send any externally-opened file once the renderer has fully loaded
  mainWindow.webContents.once('did-finish-load', () => {
    const filePath = pendingExternalFile ?? getArgvFilePath();
    pendingExternalFile = null;
    if (filePath) sendFileToRenderer(mainWindow, filePath);
  });

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

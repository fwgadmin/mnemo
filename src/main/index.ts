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
import { LocalNoteStore, migrateNoteDatabaseRef } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import type { INoteStore, AppConfig, SyncResult } from '../shared/types';
import { IPC } from '../shared/types';
import type { CreateNoteInput, UpdateNoteInput } from '../shared/types';
import { createMcpServer } from './mcp/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const matter = require('gray-matter');

// ─── Windows shell registration (Squirrel install/uninstall hooks) ─────────────

const PROG_ID   = 'MnemoNote';
// Extensions to register in the Windows right-click context menu.
// Kept to common text/config types to avoid polluting every file's menu.
const FILE_EXTS = ['.md', '.txt', '.log', '.csv', '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.env'];

function registerShellAssociations(exePath: string): void {
  const iconVal = `"${exePath}",0`;
  const cmdVal  = `"${exePath}" "%1"`;
  const cls     = 'HKCU\\Software\\Classes';

  // ProgId root — used by the "Open With" dialog and file-type ownership
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}`,                           '/ve', '/d', 'Mnemo Note',      '/f']);
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}\\DefaultIcon`,              '/ve', '/d', iconVal,            '/f']);
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}\\shell\\open`,              '/ve', '/d', 'Open in &Mnemo',  '/f']);
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}\\shell\\open`,              '/v',  'Icon', '/d', iconVal,   '/f']);
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}\\shell\\open\\command`,     '/ve', '/d', cmdVal,             '/f']);

  for (const ext of FILE_EXTS) {
    // Right-click context-menu verb on the extension key itself
    spawnSync('reg', ['add', `${cls}\\${ext}\\shell\\mnemo.open`,          '/ve', '/d', 'Open in &Mnemo',  '/f']);
    spawnSync('reg', ['add', `${cls}\\${ext}\\shell\\mnemo.open`,          '/v',  'Icon', '/d', iconVal,   '/f']);
    spawnSync('reg', ['add', `${cls}\\${ext}\\shell\\mnemo.open\\command`, '/ve', '/d', cmdVal,             '/f']);
    // Advertise ProgId so Mnemo appears in the right-click "Open with" submenu
    spawnSync('reg', ['add', `${cls}\\${ext}\\OpenWithProgids`,            '/v',  PROG_ID, '/t', 'REG_NONE', '/d', '', '/f']);
  }

  // Applications\Mnemo.exe — fills the full "Open with > Choose another app" dialog
  const app = `${cls}\\Applications\\Mnemo.exe`;
  spawnSync('reg', ['add', app,                           '/v', 'FriendlyAppName', '/d', 'Mnemo',          '/f']);
  spawnSync('reg', ['add', `${app}\\shell\\open\\command`, '/ve', '/d', cmdVal,                            '/f']);
  for (const ext of FILE_EXTS) {
    spawnSync('reg', ['add', `${app}\\SupportedTypes`,    '/v', ext, '/t', 'REG_SZ', '/d', '',             '/f']);
  }
}

function deregisterShellAssociations(): void {
  const cls = 'HKCU\\Software\\Classes';
  spawnSync('reg', ['delete', `${cls}\\${PROG_ID}`,                              '/f']);
  for (const ext of FILE_EXTS) {
    spawnSync('reg', ['delete', `${cls}\\${ext}\\shell\\mnemo.open`,             '/f']);
    spawnSync('reg', ['delete', `${cls}\\${ext}\\OpenWithProgids`, '/v', PROG_ID, '/f']);
  }
  spawnSync('reg', ['delete', `${cls}\\Applications\\Mnemo.exe`,                 '/f']);
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

// Optional: align GUI data dir with CLI (`mnemo note`, MCP) via MNEMO_HOME
if (!app.isReady()) {
  const raw = process.env['MNEMO_HOME']?.trim();
  if (raw) {
    const dir = path.resolve(raw);
    try {
      fs.mkdirSync(dir, { recursive: true });
      app.setPath('userData', dir);
    } catch {
      // keep default userData if setPath fails
    }
  }
}


// ─── External file handling ────────────────────────────────────────────────────

/** File path queued before the window finishes loading (macOS open-file, fast Windows launch) */
let pendingExternalFile: string | null = null;

/** Parse any text file and send it to the renderer as a new note import. */
function sendFileToRenderer(win: BrowserWindow, filePath: string): void {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    // Try gray-matter for .md files; for everything else use the raw content directly.
    const ext = path.extname(filePath).toLowerCase();
    let title: string;
    let body: string;
    if (ext === '.md') {
      const parsed = matter(raw);
      title = (parsed.data.title as string) || path.basename(filePath, ext);
      body  = (parsed.content as string).trim();
    } else {
      // No frontmatter parsing — use the filename (without extension, if any) as title
      // and the full raw content as body.
      title = path.basename(filePath, ext) || path.basename(filePath);
      body  = raw.trim();
    }
    win.webContents.send(IPC.FILE_OPENED_EXTERNALLY, { title, body });
  } catch {
    // Ignore unreadable / binary files
  }
}

/** Return a file path passed from the OS shell (Windows right-click / open-with). */
function getArgvFilePath(): string | null {
  // Packaged: argv = [exe, ...args]  Dev: argv = [electron, script, ...args]
  const args = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
  // Accept any path-like argument that exists on disk — extension is irrelevant.
  // Flags (starting with -) and the app's own paths are excluded.
  const appDir = path.dirname(process.execPath);
  const filePath = args.find(
    a => !a.startsWith('-') && fs.existsSync(a) && !a.startsWith(appDir),
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

// ─── Persistent config (userData/config.json) ─────────────────────────────────

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')) as AppConfig;
  } catch {
    return {};
  }
}

function writeConfig(cfg: AppConfig): void {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

async function initStore(): Promise<void> {
  const cfg = readConfig();
  // config.json takes priority; fall back to .env (dev mode)
  const tursoUrl   = cfg.tursoUrl   || process.env['MNEMO_TURSO_URL'];
  const tursoToken = cfg.tursoToken || process.env['MNEMO_TURSO_TOKEN'];
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
    {
      label: 'Mnemo',
      submenu: [
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: send('settings') },
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
      nodes: notes.map(n => ({ id: n.id, title: n.title, ref: n.ref })),
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
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, `# ${title}\n\n${body}`, 'utf-8');
    return { saved: true, filePath: result.filePath };
  });

  ipcMain.handle(IPC.FILE_OPEN, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open File',
      filters: [
        { name: 'Text Files', extensions: ['md', 'txt', 'log', 'csv', 'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'py', 'sh', 'bat', 'ps1', 'rs', 'go', 'c', 'h', 'cpp', 'java', 'rb', 'php'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths.map((fp: string) => {
      const raw  = fs.readFileSync(fp, 'utf-8');
      const ext  = path.extname(fp).toLowerCase();
      if (ext === '.md') {
        const parsed = matter(raw);
        const title  = (parsed.data.title as string) || path.basename(fp, ext);
        return { title, body: (parsed.content as string).trim() };
      }
      return { title: path.basename(fp, ext) || path.basename(fp), body: raw.trim() };
    });
  });

  ipcMain.handle(IPC.CONFIG_READ, () => readConfig());

  ipcMain.handle(IPC.CONFIG_SAVE, async (_event, cfg: AppConfig) => {
    writeConfig(cfg);
    store?.close();
    await initStore();
    // Recreate MCP server against the new store
    mcpServer?.close();
    mcpServer = createMcpServer(store);
    return true;
  });

  ipcMain.handle(IPC.CONFIG_STORE_TYPE, () =>
    store instanceof TursoNoteStore ? 'turso' : 'local',
  );

  ipcMain.handle(IPC.CONFIG_SYNC_LOCAL, async (): Promise<SyncResult> => {
    if (!(store instanceof TursoNoteStore)) {
      throw new Error('Not connected to Turso — switch to Turso first.');
    }
    const dbPath = path.join(app.getPath('userData'), 'mnemo.db');
    if (!fs.existsSync(dbPath)) return { synced: 0, skipped: 0 };

    const Database = require('better-sqlite3');
    const localDb = new Database(dbPath);
    try {
      migrateNoteDatabaseRef(localDb);
      const notes = localDb
        .prepare(
          'SELECT id, title, body, tags, tenant_id, created_at, updated_at, ref FROM notes',
        )
        .all() as Array<{
          id: string;
          title: string;
          body: string;
          tags: string;
          tenant_id: string;
          created_at: string;
          updated_at: string;
          ref: number | null;
        }>;
      const links = localDb
        .prepare('SELECT source_id, target_id FROM note_links')
        .all() as Array<{ source_id: string; target_id: string }>;
      return await store.importNotes(notes, links);
    } finally {
      localDb.close();
    }
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

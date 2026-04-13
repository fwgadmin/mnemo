import { app, BrowserWindow, ipcMain, Menu, dialog, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

// Linux: extra guard if Electron was started without ELECTRON_DISABLE_SANDBOX (e.g. packaged path).
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-setuid-sandbox');
  app.commandLine.appendSwitch('no-sandbox');
}

// Load .env from the repo root if present (dev mode cloud config)
try {
  (process as NodeJS.Process & { loadEnvFile(path?: string): void }).loadEnvFile(
    path.join(__dirname, '..', '..', '.env'),
  );
} catch {
  // .env is optional — ignore if absent
}
import { LocalNoteStore, migrateNoteDatabaseHideHeader, migrateNoteDatabaseRef } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import type { INoteStore, AppConfig, MnemoUiPreferences, SyncResult, WorkspaceStorage } from '../shared/types';
import { IPC } from '../shared/types';
import type { CreateNoteInput, UpdateNoteInput } from '../shared/types';
import { createMcpServer } from './mcp/server';
import { mergeAndWriteUiPreferencesAsync, readUiPreferencesMerged } from './uiPreferences';
import { defaultLocalDataDir, getRemoteLibsqlCredentials, legacyElectronUserDataDir } from './userConfig';
import { syncWorkspaceFolder } from './workspaceImport';
import { relocateWikilinksAfterTitleChange } from './noteOutgoingLinks';
import {
  applyBootstrapRootOnly,
  archiveWorkspaceProfile,
  createWorkspaceProfile,
  deleteWorkspaceProfile,
  getElectronBootstrapRoot,
  importFolderIntoWorkspaceProfile,
  setActiveWorkspace,
  setWorkspaceProfileStorage,
} from './workspaceProfiles';
import { readWorkspaceProfilesMerged } from './workspaceProfilesSync';
import { runLegacyWorkspaceMigration } from './workspaceMigration';
import {
  closeDedicatedStores,
  ensureActiveContext,
  getActiveWorkspaceId,
  getGlobalStore,
  purgeWorkspaceNotesForProfile,
  setActiveWorkspaceId,
  setGlobalStore,
  setStoreResolverBootstrapRoot,
} from './storeResolver';
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

function configHasRemoteCredentials(cfg: AppConfig): boolean {
  const url = cfg.tursoUrl ?? cfg.libsqlUrl;
  const token = cfg.tursoToken ?? cfg.libsqlAuthToken;
  return Boolean(url?.trim() && token?.trim());
}

/**
 * `package.json` `name` drives Electron `userData` (e.g. ~/.config/mnemo vs mnemo-note).
 * After renaming the npm package to `mnemo-note`, the default userData path changed and
 * Turso credentials in the old `config.json` were no longer read — use legacy userData
 * when it has remote DB config and the new path does not (unless MNEMO_HOME overrides).
 */
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
  } else {
    try {
      const legacyDir = legacyElectronUserDataDir();
      const legacyCfgPath = path.join(legacyDir, 'config.json');
      const currentDir = app.getPath('userData');
      const currentCfgPath = path.join(currentDir, 'config.json');
      let legacyCfg: AppConfig | null = null;
      let currentCfg: AppConfig | null = null;
      try {
        if (fs.existsSync(legacyCfgPath)) {
          legacyCfg = JSON.parse(fs.readFileSync(legacyCfgPath, 'utf-8')) as AppConfig;
        }
      } catch {
        legacyCfg = null;
      }
      try {
        if (fs.existsSync(currentCfgPath)) {
          currentCfg = JSON.parse(fs.readFileSync(currentCfgPath, 'utf-8')) as AppConfig;
        }
      } catch {
        currentCfg = null;
      }
      const legacyRemote = legacyCfg != null && configHasRemoteCredentials(legacyCfg);
      const currentRemote = currentCfg != null && configHasRemoteCredentials(currentCfg);
      if (legacyRemote && !currentRemote && legacyDir !== currentDir) {
        app.setPath('userData', legacyDir);
      }
    } catch {
      /* ignore */
    }
  }
  applyBootstrapRootOnly(app, configHasRemoteCredentials);
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

/** Per-workspace import map under userData; one-time copy from legacy global path. */
function resolveWorkspaceImportMapPath(): string {
  const ud = app.getPath('userData');
  const id = getActiveWorkspaceId();
  const name = id === 'default' ? 'workspace-import-map.json' : `workspace-import-map.${id}.json`;
  const target = path.join(ud, name);
  const legacy = path.join(defaultLocalDataDir(), 'workspace-import-map.json');
  if (!fs.existsSync(target) && fs.existsSync(legacy)) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(legacy, target);
    } catch {
      /* ignore */
    }
  }
  return target;
}

async function initStore(): Promise<void> {
  const cfg = readConfig();
  const root = app.getPath('userData');
  setStoreResolverBootstrapRoot(root);
  const { url: tursoUrl, token: tursoToken } = getRemoteLibsqlCredentials(cfg);
  if (tursoUrl && tursoToken) {
    const vaultPath = path.join(root, 'vault');
    const turso = new TursoNoteStore(tursoUrl, tursoToken, vaultPath);
    await turso.initSchema();
    store = turso;
  } else {
    const dbPath = path.join(root, 'mnemo.db');
    const vaultPath = path.join(root, 'vault');
    store = new LocalNoteStore(dbPath, vaultPath);
  }
  setGlobalStore(store);
  const profiles = await readWorkspaceProfilesMerged(store, root);
  setActiveWorkspaceId(profiles.activeWorkspaceId);
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
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  // Windows: route keyboard focus into the renderer on first paint (typing may not reach CodeMirror until a relaunch).
  mainWindow.webContents.once('did-finish-load', () => {
    try {
      mainWindow.webContents.focus();
      mainWindow.focus();
    } catch {
      /* ignore */
    }
  });
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
        { label: 'Format Note', accelerator: 'Alt+Shift+F', click: send('format-markdown') },
        { type: 'separator' },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { label: 'Open File as Tab…', accelerator: 'CmdOrCtrl+Shift+O', click: send('open-file-tab') },
        { label: 'New Vault Workspace…', click: send('vault-new') },
        { label: 'Open Workspace Folder…', click: send('workspace-choose') },
        { label: 'Sync Workspace', click: send('workspace-sync') },
        { label: 'Manage Vault Workspaces…', click: send('vault-manage') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: send('toggle-sidebar') },
        { label: 'Next Note', accelerator: 'Ctrl+Tab', click: send('note-next') },
        { label: 'Previous Note', accelerator: 'Ctrl+Shift+Tab', click: send('note-prev') },
        { label: 'Toggle Note Header', accelerator: 'CmdOrCtrl+Shift+H', click: send('toggle-header') },
        { label: 'Toggle Line Numbers', accelerator: 'CmdOrCtrl+Shift+L', click: send('toggle-line-numbers') },
        { label: 'Toggle Note Index Numbers', accelerator: 'CmdOrCtrl+Shift+N', click: send('toggle-note-refs') },
        { type: 'separator' },
        { label: 'Toggle Graph', accelerator: 'CmdOrCtrl+G', click: send('toggle-graph') },
        { label: 'Markdown Helper', accelerator: 'CmdOrCtrl+M', click: send('toggle-markdown-help') },
        { label: 'Markdown Preview', accelerator: 'CmdOrCtrl+Shift+V', click: send('toggle-markdown-preview') },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Command+F' : 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          },
        },
      ],
    },
    {
      label: 'Mnemo',
      submenu: [
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: send('settings') },
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

/** Native menu is only used on macOS (system menu bar). On Windows/Linux we omit it so Alt does not reveal a duplicate menu bar; shortcuts come from the renderer. */
function applyApplicationMenu(mainWindow: BrowserWindow): void {
  if (process.platform === 'darwin') {
    buildMenu(mainWindow);
  } else {
    Menu.setApplicationMenu(null);
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.NOTE_CREATE, async (_event, input: CreateNoteInput) => {
    const ctx = await ensureActiveContext();
    return ctx.store.create({ ...input, tenantId: input.tenantId ?? ctx.tenantId });
  });

  ipcMain.handle(IPC.NOTE_READ, async (_event, id: string) => {
    const ctx = await ensureActiveContext();
    return ctx.store.read(id);
  });

  ipcMain.handle(IPC.NOTE_UPDATE, async (_event, input: UpdateNoteInput) => {
    const ctx = await ensureActiveContext();
    return ctx.store.update(input);
  });

  ipcMain.handle(IPC.NOTE_DELETE, async (_event, id: string) => {
    const ctx = await ensureActiveContext();
    return ctx.store.delete(id);
  });

  ipcMain.handle(IPC.NOTE_LIST, async () => {
    const ctx = await ensureActiveContext();
    return ctx.store.list(ctx.tenantId);
  });

  ipcMain.handle(IPC.NOTE_VAULT_SNAPSHOT, async () => {
    const ctx = await ensureActiveContext();
    return ctx.store.getVaultSnapshot(ctx.tenantId);
  });

  ipcMain.handle(IPC.NOTE_SEARCH, async (_event, query: string) => {
    const ctx = await ensureActiveContext();
    return ctx.store.search(query, ctx.tenantId);
  });

  ipcMain.handle(IPC.NOTE_BACKLINKS, async (_event, noteId: string) => {
    const ctx = await ensureActiveContext();
    return ctx.store.getBacklinks(noteId);
  });

  ipcMain.handle(IPC.NOTE_GRAPH, async () => {
    const ctx = await ensureActiveContext();
    const [notes, links] = await Promise.all([
      ctx.store.list(ctx.tenantId),
      ctx.store.getAllLinks(ctx.tenantId),
    ]);
    return {
      nodes: notes.map(n => ({ id: n.id, title: n.title, ref: n.ref })),
      links,
    };
  });

  ipcMain.handle(IPC.NOTE_UPDATE_LINKS, async (_event, sourceId: string, targetIds: string[]) => {
    const ctx = await ensureActiveContext();
    return ctx.store.updateLinks(sourceId, targetIds);
  });

  ipcMain.handle(IPC.NOTE_RESOLVE_TITLE, async (_event, title: string) => {
    const ctx = await ensureActiveContext();
    return ctx.store.resolveTitle(title, ctx.tenantId);
  });

  ipcMain.handle(
    IPC.NOTE_RELOCATE_WIKILINKS_ON_RENAME,
    async (_event, oldTitle: string, newTitle: string) => {
      const ctx = await ensureActiveContext();
      await relocateWikilinksAfterTitleChange(ctx.store, oldTitle, newTitle, ctx.tenantId);
    },
  );

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

  ipcMain.handle(IPC.FILE_READ_PATH, async (_event, absPath: string) => {
    if (typeof absPath !== 'string' || !absPath.trim()) return null;
    const fp = path.resolve(absPath.trim());
    try {
      return fs.readFileSync(fp, 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC.FILE_WRITE_PATH, async (_event, absPath: string, body: string) => {
    if (typeof absPath !== 'string' || !absPath.trim()) return false;
    if (typeof body !== 'string') return false;
    const fp = path.resolve(absPath.trim());
    try {
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, body, 'utf-8');
      return true;
    } catch {
      return false;
    }
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
        return { title, body: (parsed.content as string).trim(), path: fp };
      }
      return { title: path.basename(fp, ext) || path.basename(fp), body: raw.trim(), path: fp };
    });
  });

  ipcMain.handle(IPC.CONFIG_READ, () => readConfig());

  ipcMain.handle(IPC.CONFIG_SAVE, async (_event, cfg: AppConfig) => {
    writeConfig(cfg);
    store?.close();
    closeDedicatedStores();
    await initStore();
    mcpServer?.close();
    mcpServer = createMcpServer(ensureActiveContext);
    return true;
  });

  ipcMain.handle(IPC.CONFIG_STORE_TYPE, () =>
    store instanceof TursoNoteStore ? 'turso' : 'local',
  );

  ipcMain.handle(IPC.CONFIG_SYNC_LOCAL, async (): Promise<SyncResult> => {
    const gs = getGlobalStore();
    if (!(gs instanceof TursoNoteStore)) {
      throw new Error('Not connected to a remote libSQL database — configure one in Settings first.');
    }
    const dbPath = path.join(app.getPath('userData'), 'mnemo.db');
    if (!fs.existsSync(dbPath)) return { synced: 0, skipped: 0 };

    const Database = require('better-sqlite3');
    const localDb = new Database(dbPath);
    try {
      migrateNoteDatabaseRef(localDb);
      migrateNoteDatabaseHideHeader(localDb);
      const notes = localDb
        .prepare(
          'SELECT id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header FROM notes',
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
          hide_header: number;
        }>;
      const links = localDb
        .prepare('SELECT source_id, target_id FROM note_links')
        .all() as Array<{ source_id: string; target_id: string }>;
      return await gs.importNotes(notes, links);
    } finally {
      localDb.close();
    }
  });

  ipcMain.handle(IPC.UI_PREFERENCES_READ, async () => {
    const ctx = await ensureActiveContext();
    return readUiPreferencesMerged(ctx.store, app.getPath('userData'), ctx.workspaceId);
  });

  ipcMain.handle(IPC.UI_PREFERENCES_SAVE, async (_event, partial: Partial<MnemoUiPreferences>) => {
    const ctx = await ensureActiveContext();
    await mergeAndWriteUiPreferencesAsync(partial, app.getPath('userData'), ctx.store, ctx.workspaceId);
    return true;
  });

  ipcMain.handle(IPC.WINDOW_TOGGLE_FULLSCREEN, event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.handle(IPC.WORKSPACE_CHOOSE_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Workspace Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false as const, path: null };
    }
    const folderRoot = path.resolve(result.filePaths[0]);
    const ctx = await ensureActiveContext();
    await mergeAndWriteUiPreferencesAsync(
      { workspaceFolder: folderRoot },
      app.getPath('userData'),
      ctx.store,
      ctx.workspaceId,
    );
    const mapPath = resolveWorkspaceImportMapPath();
    const stats = await syncWorkspaceFolder(ctx.store, folderRoot, mapPath, ctx.tenantId);
    return {
      ok: true as const,
      path: folderRoot,
      imported: stats.imported,
      updated: stats.updated,
    };
  });

  ipcMain.handle(IPC.WORKSPACE_SYNC, async () => {
    const ctx = await ensureActiveContext();
    const prefs = await readUiPreferencesMerged(ctx.store, app.getPath('userData'), ctx.workspaceId);
    const folderRoot = prefs.workspaceFolder?.trim();
    if (!folderRoot) {
      return { ok: false as const, error: 'No workspace folder configured (use File → Open Workspace Folder…).' };
    }
    const mapPath = resolveWorkspaceImportMapPath();
    const stats = await syncWorkspaceFolder(ctx.store, folderRoot, mapPath, ctx.tenantId);
    return { ok: true as const, imported: stats.imported, updated: stats.updated };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import markdown from folder (new vault)',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false as const, path: null };
    }
    return { ok: true as const, path: path.resolve(result.filePaths[0]) };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_LIST, async () => {
    const root = getElectronBootstrapRoot();
    const gs = getGlobalStore();
    const profiles = await readWorkspaceProfilesMerged(gs, root);
    return { ok: true as const, localMode: true, profiles };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_CREATE, async (_event, name: unknown, importFolder: unknown) => {
    const root = getElectronBootstrapRoot();
    const gs = getGlobalStore();
    if (!gs) {
      return { ok: false as const, error: 'Store not ready.' };
    }
    const { state, newId } = createWorkspaceProfile(root, typeof name === 'string' ? name : '');
    const folder =
      typeof importFolder === 'string' && importFolder.trim().length > 0 ? importFolder.trim() : null;
    if (folder) {
      try {
        const stats = await importFolderIntoWorkspaceProfile(root, newId, folder, gs);
        return {
          ok: true as const,
          profiles: state,
          newWorkspaceId: newId,
          imported: stats.imported,
          updated: stats.updated,
        };
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    return { ok: true as const, profiles: state, newWorkspaceId: newId };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_SWITCH, (_event, id: unknown) => {
    const root = getElectronBootstrapRoot();
    const next = setActiveWorkspace(root, typeof id === 'string' ? id : '');
    if (!next) {
      return { ok: false as const, error: 'Unknown workspace.' };
    }
    setActiveWorkspaceId(next.activeWorkspaceId);
    return { ok: true as const, profiles: next };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_ARCHIVE, async (_event, id: unknown) => {
    const root = getElectronBootstrapRoot();
    const wid = typeof id === 'string' ? id : '';
    const profilesBefore = await readWorkspaceProfilesMerged(getGlobalStore(), root);
    const entry = profilesBefore.workspaces.find(w => w.id === wid);
    const result = archiveWorkspaceProfile(root, wid);
    if (!result) {
      return {
        ok: false as const,
        error:
          'Cannot archive: switch to another workspace first, keep at least two vaults, and do not archive the Default vault.',
      };
    }
    if (entry) await purgeWorkspaceNotesForProfile(entry);
    const st = entry?.storage ?? { mode: 'inherit' as const };
    if (st.mode === 'sqlite') {
      try {
        fs.unlinkSync(st.dbPath);
      } catch {
        /* ignore */
      }
      try {
        fs.rmSync(st.vaultPath, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    return { ok: true as const, profiles: result.state };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_DELETE, async (_event, id: unknown) => {
    const root = getElectronBootstrapRoot();
    const wid = typeof id === 'string' ? id : '';
    const profilesBefore = await readWorkspaceProfilesMerged(getGlobalStore(), root);
    const entry = profilesBefore.workspaces.find(w => w.id === wid);
    const result = deleteWorkspaceProfile(root, wid);
    if (!result) {
      return {
        ok: false as const,
        error:
          'Cannot delete: switch to another workspace first, keep at least two vaults, and do not delete the Default vault.',
      };
    }
    if (entry) await purgeWorkspaceNotesForProfile(entry);
    const st = entry?.storage ?? { mode: 'inherit' as const };
    if (st.mode === 'sqlite') {
      try {
        fs.unlinkSync(st.dbPath);
      } catch {
        /* ignore */
      }
      try {
        fs.rmSync(st.vaultPath, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    return { ok: true as const, profiles: result.state };
  });

  ipcMain.handle(
    IPC.WORKSPACE_PROFILES_SET_STORAGE,
    (_event, id: unknown, storage: unknown) => {
      const root = getElectronBootstrapRoot();
      if (typeof id !== 'string' || !id.trim()) {
        return { ok: false as const, error: 'Invalid workspace id.' };
      }
      if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
        return { ok: false as const, error: 'Invalid storage payload.' };
      }
      const s = storage as WorkspaceStorage;
      if (s.mode !== 'inherit' && s.mode !== 'sqlite' && s.mode !== 'remote') {
        return { ok: false as const, error: 'Invalid storage mode.' };
      }
      closeDedicatedStores();
      const next = setWorkspaceProfileStorage(root, id.trim(), s);
      if (!next) {
        return { ok: false as const, error: 'Unknown workspace.' };
      }
      return { ok: true as const, profiles: next };
    },
  );
}

app.whenReady().then(async () => {
  runLegacyWorkspaceMigration(app.getPath('userData'));
  await initStore();
  registerIpcHandlers();

  mcpServer = createMcpServer(ensureActiveContext);

  const mainWindow = createWindow();
  applyApplicationMenu(mainWindow);

  // Send any externally-opened file once the first window has fully loaded (separate listener so argv/open-file is only handled once).
  mainWindow.webContents.once('did-finish-load', () => {
    const filePath = pendingExternalFile ?? getArgvFilePath();
    pendingExternalFile = null;
    if (filePath) sendFileToRenderer(mainWindow, filePath);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      applyApplicationMenu(w);
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
  closeDedicatedStores();
  store?.close();
});

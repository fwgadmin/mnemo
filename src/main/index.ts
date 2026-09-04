import { app, BrowserWindow, ipcMain, Menu, dialog, nativeImage, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

// Packaged archives cannot guarantee root:root/4755 on chrome-sandbox. Disable only the SUID
// helper so Chromium uses its user-namespace sandbox; keep the renderer sandbox enabled below.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-setuid-sandbox');
  // Explicit development-only escape hatch for hosts where user namespaces are also unavailable.
  if (!app.isPackaged && process.env['ELECTRON_DISABLE_SANDBOX'] === '1') {
    app.commandLine.appendSwitch('no-sandbox');
  }
}

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
import { pullTursoIntoLocalStore, readLocalNotesAndLinksForSync } from './storePullRemote';
import type { INoteStore, AppConfig, MnemoUiPreferences, SyncResult, WorkspaceStorage } from '../shared/types';
import { IPC, STORED_SECRET_PLACEHOLDER } from '../shared/types';
import { resolveActiveProfile } from '../shared/llmProfile';
import { readLlmConfig, writeLlmConfig, sanitizeLlmSettings, effectiveGuardrails } from './llm/llmConfig';
import { summarizeWithProfile } from './llm/summarizeWithProfile';
import type { CreateNoteInput, SaveNoteInput, UpdateNoteInput } from '../shared/types';
import { createMcpServer } from './mcp/server';
import { mergeAndWriteUiPreferencesAsync, readUiPreferencesMerged } from './uiPreferences';
import {
  defaultLocalDataDir,
  getRemoteLibsqlCredentials,
  legacyElectronUserDataDir,
  readRemoteConfigFromBootstrapDir,
} from './userConfig';
import { syncWorkspaceFolder } from './workspaceImport';
import { relocateWikilinksAfterTitleChange, saveNoteWithOutgoingLinks } from './noteOutgoingLinks';
import {
  applyBootstrapRootOnly,
  archiveWorkspaceProfile,
  createWorkspaceProfile,
  deleteWorkspaceProfile,
  getElectronBootstrapRoot,
  importFolderIntoWorkspaceProfile,
  renameWorkspaceProfile,
  restoreWorkspaceProfile,
  setActiveWorkspace,
  setWorkspaceProfileStorage,
  setWorkspaceSecretCodec,
  readWorkspaceProfilesFile,
  writeWorkspaceProfilesFileDiskOnly,
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
import { protectSecret, unprotectSecret, writePrivateJson } from './secretStorage';
import { FileCapabilityStore, pathIsInside } from './fileCapabilities';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const matter = require('gray-matter');

// ─── Windows shell registration (Squirrel install/uninstall hooks) ─────────────

const PROG_ID = 'MnemoNote';
// Extensions to register in the Windows right-click context menu.
// Kept to common text/config types to avoid polluting every file's menu.
const FILE_EXTS = ['.md', '.txt', '.log', '.csv', '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.env'];

function registerShellAssociations(exePath: string): void {
  const iconVal = `"${exePath}",0`;
  const cmdVal = `"${exePath}" "%1"`;
  const cls = 'HKCU\\Software\\Classes';

  // ProgId root — used by the "Open With" dialog and file-type ownership
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}`, '/ve', '/d', 'Mnemo Note', '/f']);
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}\\DefaultIcon`, '/ve', '/d', iconVal, '/f']);
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}\\shell\\open`, '/ve', '/d', 'Open in &Mnemo', '/f']);
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}\\shell\\open`, '/v', 'Icon', '/d', iconVal, '/f']);
  spawnSync('reg', ['add', `${cls}\\${PROG_ID}\\shell\\open\\command`, '/ve', '/d', cmdVal, '/f']);

  for (const ext of FILE_EXTS) {
    // Right-click context-menu verb on the extension key itself
    spawnSync('reg', ['add', `${cls}\\${ext}\\shell\\mnemo.open`, '/ve', '/d', 'Open in &Mnemo', '/f']);
    spawnSync('reg', ['add', `${cls}\\${ext}\\shell\\mnemo.open`, '/v', 'Icon', '/d', iconVal, '/f']);
    spawnSync('reg', ['add', `${cls}\\${ext}\\shell\\mnemo.open\\command`, '/ve', '/d', cmdVal, '/f']);
    // Advertise ProgId so Mnemo appears in the right-click "Open with" submenu
    spawnSync('reg', ['add', `${cls}\\${ext}\\OpenWithProgids`, '/v', PROG_ID, '/t', 'REG_NONE', '/d', '', '/f']);
  }

  // Applications\Mnemo.exe — fills the full "Open with > Choose another app" dialog
  const app = `${cls}\\Applications\\Mnemo.exe`;
  spawnSync('reg', ['add', app, '/v', 'FriendlyAppName', '/d', 'Mnemo', '/f']);
  spawnSync('reg', ['add', `${app}\\shell\\open\\command`, '/ve', '/d', cmdVal, '/f']);
  for (const ext of FILE_EXTS) {
    spawnSync('reg', ['add', `${app}\\SupportedTypes`, '/v', ext, '/t', 'REG_SZ', '/d', '', '/f']);
  }
}

function deregisterShellAssociations(): void {
  const cls = 'HKCU\\Software\\Classes';
  spawnSync('reg', ['delete', `${cls}\\${PROG_ID}`, '/f']);
  for (const ext of FILE_EXTS) {
    spawnSync('reg', ['delete', `${cls}\\${ext}\\shell\\mnemo.open`, '/f']);
    spawnSync('reg', ['delete', `${cls}\\${ext}\\OpenWithProgids`, '/v', PROG_ID, '/f']);
  }
  spawnSync('reg', ['delete', `${cls}\\Applications\\Mnemo.exe`, '/f']);
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
      const currentDir = app.getPath('userData');
      // Flat + workspaces/default/config.json — same as CLI resolveWorkspaceBootstrapRoot / applyBootstrapRootOnly.
      const legacyRemote = readRemoteConfigFromBootstrapDir(legacyDir) != null;
      const currentRemote = readRemoteConfigFromBootstrapDir(currentDir) != null;
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
      body = (parsed.content as string).trim();
    } else {
      // No frontmatter parsing — use the filename (without extension, if any) as title
      // and the full raw content as body.
      title = path.basename(filePath, ext) || path.basename(filePath);
      body = raw.trim();
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
  const filePath = args.find((a) => !a.startsWith('-') && fs.existsSync(a) && !a.startsWith(appDir));
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
const fileCapabilities = new FileCapabilityStore();
const approvedImportFolders = new Map<number, Set<string>>();

function isApprovedExternalUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
}

const TEXT_FILE_FILTERS: Electron.FileFilter[] = [
  {
    name: 'Text Files',
    extensions: [
      'md',
      'txt',
      'log',
      'csv',
      'json',
      'yaml',
      'yml',
      'toml',
      'ini',
      'conf',
      'cfg',
      'xml',
      'html',
      'htm',
      'css',
      'js',
      'ts',
      'py',
      'sh',
      'bat',
      'ps1',
      'rs',
      'go',
      'c',
      'h',
      'cpp',
      'java',
      'rb',
      'php',
    ],
  },
  { name: 'All Files', extensions: ['*'] },
];

function readExternalTextFile(filePath: string): {
  title: string;
  body: string;
} {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md') {
    const parsed = matter(raw);
    return {
      title: (parsed.data.title as string) || path.basename(filePath, ext),
      body: (parsed.content as string).trim(),
    };
  }
  return {
    title: path.basename(filePath, ext) || path.basename(filePath),
    body: raw.trim(),
  };
}

function canonicalExistingPath(filePath: string): string | null {
  try {
    const resolved = fs.realpathSync(filePath);
    return fs.statSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

// ─── Persistent config (userData/config.json) ─────────────────────────────────

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig(): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')) as AppConfig;
    return {
      ...raw,
      tursoToken: raw.tursoToken ? unprotectSecret(raw.tursoToken) || undefined : undefined,
      libsqlAuthToken: raw.libsqlAuthToken ? unprotectSecret(raw.libsqlAuthToken) || undefined : undefined,
    };
  } catch {
    return {};
  }
}

function writeConfig(cfg: AppConfig): void {
  writePrivateJson(getConfigPath(), {
    ...cfg,
    tursoToken: cfg.tursoToken ? protectSecret(cfg.tursoToken) : undefined,
    libsqlAuthToken: cfg.libsqlAuthToken ? protectSecret(cfg.libsqlAuthToken) : undefined,
  });
}

function rendererConfig(cfg: AppConfig): AppConfig {
  return {
    ...cfg,
    tursoToken: cfg.tursoToken ? STORED_SECRET_PLACEHOLDER : undefined,
    libsqlAuthToken: cfg.libsqlAuthToken ? STORED_SECRET_PLACEHOLDER : undefined,
  };
}

function rendererLlmSettings(settings: ReturnType<typeof readLlmConfig>): ReturnType<typeof readLlmConfig> {
  return {
    ...settings,
    profiles: settings.profiles.map((profile) => ({
      ...profile,
      apiKey: profile.apiKey ? STORED_SECRET_PLACEHOLDER : undefined,
    })),
  };
}

function rendererWorkspaceProfiles(profiles: Awaited<ReturnType<typeof readWorkspaceProfilesMerged>>) {
  return {
    ...profiles,
    workspaces: profiles.workspaces.map((workspace) => {
      if (workspace.storage?.mode !== 'remote') return workspace;
      return {
        ...workspace,
        storage: {
          ...workspace.storage,
          tursoToken: workspace.storage.tursoToken ? STORED_SECRET_PLACEHOLDER : undefined,
          libsqlAuthToken: workspace.storage.libsqlAuthToken ? STORED_SECRET_PLACEHOLDER : undefined,
        },
      };
    }),
  };
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
  const iconPath = path.join(
    __dirname,
    '..',
    '..',
    'src',
    'assets',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png',
  );
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
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isApprovedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === mainWindow.webContents.getURL()) return;
    event.preventDefault();
    if (isApprovedExternalUrl(url)) void shell.openExternal(url);
  });
  const rendererId = mainWindow.webContents.id;
  mainWindow.webContents.once('destroyed', () => {
    fileCapabilities.revokeOwner(rendererId);
    approvedImportFolders.delete(rendererId);
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
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: send('new-note'),
        },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: send('save-as'),
        },
        {
          label: 'Format Note',
          accelerator: 'Alt+Shift+F',
          click: send('format-markdown'),
        },
        { type: 'separator' },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        {
          label: 'Open File as Tab…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: send('open-file-tab'),
        },
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
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: send('toggle-sidebar'),
        },
        {
          label: 'Next Note',
          accelerator: 'Ctrl+Tab',
          click: send('note-next'),
        },
        {
          label: 'Previous Note',
          accelerator: 'Ctrl+Shift+Tab',
          click: send('note-prev'),
        },
        {
          label: 'Toggle Note Header',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: send('toggle-header'),
        },
        {
          label: 'Toggle Line Numbers',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: send('toggle-line-numbers'),
        },
        {
          label: 'Toggle Note Index Numbers',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: send('toggle-note-refs'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Graph',
          accelerator: 'CmdOrCtrl+G',
          click: send('toggle-graph'),
        },
        {
          label: 'Markdown Helper',
          accelerator: 'CmdOrCtrl+M',
          click: send('toggle-markdown-help'),
        },
        {
          label: 'Markdown Preview',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: send('toggle-markdown-preview'),
        },
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
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: send('settings'),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [{ label: 'Documentation', click: send('show-help') }],
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
    return ctx.store.create({
      ...input,
      tenantId: input.tenantId ?? ctx.tenantId,
    });
  });

  ipcMain.handle(IPC.NOTE_READ, async (_event, id: string) => {
    const ctx = await ensureActiveContext();
    return ctx.store.read(id);
  });

  ipcMain.handle(IPC.NOTE_UPDATE, async (_event, input: UpdateNoteInput) => {
    const ctx = await ensureActiveContext();
    return ctx.store.update(input);
  });

  ipcMain.handle(IPC.NOTE_SAVE, async (_event, input: SaveNoteInput) => {
    const ctx = await ensureActiveContext();
    return saveNoteWithOutgoingLinks(ctx.store, input, ctx.tenantId);
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
    const [notes, links] = await Promise.all([ctx.store.list(ctx.tenantId), ctx.store.getAllLinks(ctx.tenantId)]);
    return {
      nodes: notes.map((n) => ({ id: n.id, title: n.title, ref: n.ref })),
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

  ipcMain.handle(IPC.NOTE_RELOCATE_WIKILINKS_ON_RENAME, async (_event, oldTitle: string, newTitle: string) => {
    const ctx = await ensureActiveContext();
    await relocateWikilinksAfterTitleChange(ctx.store, oldTitle, newTitle, ctx.tenantId);
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

  ipcMain.handle(IPC.FILE_AUTHORIZE_PATH, async (event, absPath: unknown) => {
    if (typeof absPath !== 'string' || !absPath.trim()) return null;
    const requested = canonicalExistingPath(absPath.trim());
    if (!requested) return null;

    const ctx = await ensureActiveContext();
    const prefs = await readUiPreferencesMerged(ctx.store, app.getPath('userData'), ctx.workspaceId);
    const workspaceRoot = prefs.workspaceFolder?.trim();
    let approved = false;
    if (workspaceRoot) {
      try {
        approved = pathIsInside(fs.realpathSync(workspaceRoot), requested);
      } catch {
        approved = false;
      }
    }
    if (!approved) {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        title: 'Reauthorize File Tab',
        defaultPath: requested,
        filters: TEXT_FILE_FILTERS,
        properties: ['openFile'],
      };
      const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return null;
      const selected = canonicalExistingPath(result.filePaths[0]);
      if (!selected || selected !== requested) return null;
    }
    try {
      return {
        path: requested,
        body: fs.readFileSync(requested, 'utf-8'),
        capabilityId: fileCapabilities.grant(requested, event.sender.id),
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC.FILE_READ_PATH, async (event, capabilityId: unknown) => {
    const fp = fileCapabilities.resolve(capabilityId, event.sender.id);
    if (!fp) return null;
    try {
      return fs.readFileSync(fp, 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC.FILE_WRITE_PATH, async (event, capabilityId: unknown, body: string) => {
    if (typeof body !== 'string') return false;
    const fp = fileCapabilities.resolve(capabilityId, event.sender.id);
    if (!fp) return false;
    try {
      fs.writeFileSync(fp, body, 'utf-8');
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC.FILE_OPEN, async (event) => {
    const result = await dialog.showOpenDialog({
      title: 'Open File',
      filters: TEXT_FILE_FILTERS,
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths.map((fp: string) => {
      const canonical = canonicalExistingPath(fp) ?? path.resolve(fp);
      return {
        ...readExternalTextFile(canonical),
        path: canonical,
        capabilityId: fileCapabilities.grant(canonical, event.sender.id),
      };
    });
  });

  ipcMain.handle(IPC.CONFIG_READ, () => rendererConfig(readConfig()));

  ipcMain.handle(IPC.CONFIG_SAVE, async (_event, cfg: AppConfig) => {
    const previous = readConfig();
    writeConfig({
      ...cfg,
      tursoToken: cfg.tursoToken === STORED_SECRET_PLACEHOLDER ? previous.tursoToken : cfg.tursoToken,
      libsqlAuthToken:
        cfg.libsqlAuthToken === STORED_SECRET_PLACEHOLDER ? previous.libsqlAuthToken : cfg.libsqlAuthToken,
    });
    store?.close();
    closeDedicatedStores();
    await initStore();
    mcpServer?.close();
    mcpServer = createMcpServer(ensureActiveContext);
    return true;
  });

  ipcMain.handle(IPC.CONFIG_STORE_TYPE, () => (store instanceof TursoNoteStore ? 'turso' : 'local'));

  ipcMain.handle(IPC.CONFIG_SYNC_LOCAL, async (): Promise<SyncResult> => {
    const gs = getGlobalStore();
    if (!(gs instanceof TursoNoteStore)) {
      throw new Error('Not connected to a remote libSQL database — configure one in Settings first.');
    }
    const dbPath = path.join(app.getPath('userData'), 'mnemo.db');
    const { notes, links } = readLocalNotesAndLinksForSync(dbPath);
    if (notes.length === 0) return { synced: 0, skipped: 0 };
    return gs.importNotes(notes, links);
  });

  ipcMain.handle(IPC.CONFIG_SYNC_PULL_LOCAL, async (): Promise<SyncResult> => {
    const gs = getGlobalStore();
    if (!(gs instanceof TursoNoteStore)) {
      throw new Error('Not connected to a remote libSQL database — configure one in Settings first.');
    }
    const dbPath = path.join(app.getPath('userData'), 'mnemo.db');
    const vaultPath = path.join(app.getPath('userData'), 'vault');
    return await pullTursoIntoLocalStore(gs, dbPath, vaultPath);
  });

  ipcMain.handle(IPC.UI_PREFERENCES_READ, async () => {
    const ctx = await ensureActiveContext();
    return readUiPreferencesMerged(ctx.store, app.getPath('userData'), ctx.workspaceId);
  });

  ipcMain.handle(IPC.UI_PREFERENCES_SAVE, async (_event, partial: Partial<MnemoUiPreferences>) => {
    const ctx = await ensureActiveContext();
    const safePartial = { ...partial };
    // Non-empty workspace roots are granted only by WORKSPACE_CHOOSE_FOLDER's native picker.
    if (safePartial.workspaceFolder?.trim()) delete safePartial.workspaceFolder;
    await mergeAndWriteUiPreferencesAsync(safePartial, app.getPath('userData'), ctx.store, ctx.workspaceId);
    return true;
  });

  ipcMain.handle(IPC.LLM_READ, () => rendererLlmSettings(readLlmConfig(app.getPath('userData'))));

  ipcMain.handle(IPC.LLM_SAVE, async (_event, incoming: unknown) => {
    const userData = app.getPath('userData');
    const prev = readLlmConfig(userData);
    const next = sanitizeLlmSettings(incoming);
    for (const p of next.profiles) {
      const old = prev.profiles.find((o) => o.id === p.id);
      if (old && p.apiKey === STORED_SECRET_PLACEHOLDER) {
        p.apiKey = old.apiKey;
        continue;
      }
      if (
        old &&
        (!p.apiKey || !p.apiKey.trim()) &&
        (p.providerKind === 'anthropic' || p.providerKind === 'google_gemini')
      ) {
        p.apiKey = old.apiKey;
      }
    }
    writeLlmConfig(userData, next);
    return true;
  });

  ipcMain.handle(IPC.LLM_SUMMARIZE, async (_event, body: unknown) => {
    if (!body || typeof body !== 'object') {
      return { ok: false as const, error: 'Invalid request' };
    }
    const text = typeof (body as { text?: unknown }).text === 'string' ? (body as { text: string }).text : '';
    if (!text.trim()) {
      return { ok: false as const, error: 'No text to summarize' };
    }
    const formattedMarkdown =
      typeof (body as { formattedMarkdown?: unknown }).formattedMarkdown === 'boolean'
        ? (body as { formattedMarkdown: boolean }).formattedMarkdown
        : false;
    const userData = app.getPath('userData');
    const settings = readLlmConfig(userData);
    const profile = resolveActiveProfile(settings);
    if (!profile) {
      return { ok: false as const, error: 'No valid LLM profile configured' };
    }
    const guardrailsUser = effectiveGuardrails(settings);
    try {
      const summary = await summarizeWithProfile({
        profile,
        guardrailsUser,
        textToSummarize: text.trim(),
        formattedMarkdown,
      });
      return { ok: true as const, summary };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle(IPC.WINDOW_TOGGLE_FULLSCREEN, (event) => {
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
      return {
        ok: false as const,
        error: 'No workspace folder configured (use File → Open Workspace Folder…).',
      };
    }
    const mapPath = resolveWorkspaceImportMapPath();
    const stats = await syncWorkspaceFolder(ctx.store, folderRoot, mapPath, ctx.tenantId);
    return {
      ok: true as const,
      imported: stats.imported,
      updated: stats.updated,
    };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_PICK_FOLDER, async event => {
    const result = await dialog.showOpenDialog({
      title: 'Import markdown from folder (new vault)',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false as const, path: null };
    }
    const selected = path.resolve(result.filePaths[0]);
    let approved = approvedImportFolders.get(event.sender.id);
    if (!approved) {
      approved = new Set<string>();
      approvedImportFolders.set(event.sender.id, approved);
    }
    approved.add(selected);
    return { ok: true as const, path: selected };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_LIST, async () => {
    const root = getElectronBootstrapRoot();
    const gs = getGlobalStore();
    const profiles = await readWorkspaceProfilesMerged(gs, root);
    return {
      ok: true as const,
      localMode: true,
      profiles: rendererWorkspaceProfiles(profiles),
    };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_CREATE, async (event, name: unknown, importFolder: unknown) => {
    const root = getElectronBootstrapRoot();
    const gs = getGlobalStore();
    if (!gs) {
      return { ok: false as const, error: 'Store not ready.' };
    }
    const folder = typeof importFolder === 'string' && importFolder.trim().length > 0 ? importFolder.trim() : null;
    if (folder) {
      const resolvedFolder = path.resolve(folder);
      const approved = approvedImportFolders.get(event.sender.id);
      if (!approved?.delete(resolvedFolder)) {
        return { ok: false as const, error: 'Choose the import folder again to authorize access.' };
      }
    }
    const { state, newId } = createWorkspaceProfile(root, typeof name === 'string' ? name : '');
    if (folder) {
      const resolvedFolder = path.resolve(folder);
      try {
        const stats = await importFolderIntoWorkspaceProfile(root, newId, resolvedFolder, gs);
        return {
          ok: true as const,
          profiles: rendererWorkspaceProfiles(state),
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
    return {
      ok: true as const,
      profiles: rendererWorkspaceProfiles(state),
      newWorkspaceId: newId,
    };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_SWITCH, (_event, id: unknown) => {
    const root = getElectronBootstrapRoot();
    const next = setActiveWorkspace(root, typeof id === 'string' ? id : '');
    if (!next) {
      return { ok: false as const, error: 'Unknown workspace.' };
    }
    setActiveWorkspaceId(next.activeWorkspaceId);
    fileCapabilities.revokeAll();
    return { ok: true as const, profiles: rendererWorkspaceProfiles(next) };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_ARCHIVE, async (_event, id: unknown) => {
    const root = getElectronBootstrapRoot();
    const wid = typeof id === 'string' ? id : '';
    const result = archiveWorkspaceProfile(root, wid);
    if (!result) {
      return {
        ok: false as const,
        error:
          'Cannot archive: switch to another workspace first, keep an active vault, and do not archive the Default or an already archived vault.',
      };
    }
    return {
      ok: true as const,
      profiles: rendererWorkspaceProfiles(result.state),
    };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_RESTORE, (_event, id: unknown) => {
    const root = getElectronBootstrapRoot();
    const result = restoreWorkspaceProfile(root, typeof id === 'string' ? id : '');
    if (!result) {
      return {
        ok: false as const,
        error: 'Unknown workspace or workspace is not archived.',
      };
    }
    return {
      ok: true as const,
      profiles: rendererWorkspaceProfiles(result.state),
    };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_DELETE, async (_event, id: unknown) => {
    const root = getElectronBootstrapRoot();
    const wid = typeof id === 'string' ? id : '';
    const profilesBefore = await readWorkspaceProfilesMerged(getGlobalStore(), root);
    const entry = profilesBefore.workspaces.find((w) => w.id === wid);
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
    return {
      ok: true as const,
      profiles: rendererWorkspaceProfiles(result.state),
    };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_SET_STORAGE, (_event, id: unknown, storage: unknown) => {
    const root = getElectronBootstrapRoot();
    if (typeof id !== 'string' || !id.trim()) {
      return { ok: false as const, error: 'Invalid workspace id.' };
    }
    if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
      return { ok: false as const, error: 'Invalid storage payload.' };
    }
    let s = storage as WorkspaceStorage;
    if (s.mode !== 'inherit' && s.mode !== 'sqlite' && s.mode !== 'remote') {
      return { ok: false as const, error: 'Invalid storage mode.' };
    }
    if (s.mode === 'remote') {
      const current = readWorkspaceProfilesFile(root).workspaces.find((workspace) => workspace.id === id.trim());
      if (current?.storage?.mode === 'remote') {
        if (s.tursoToken === STORED_SECRET_PLACEHOLDER) s.tursoToken = current.storage.tursoToken;
        if (s.libsqlAuthToken === STORED_SECRET_PLACEHOLDER) {
          s.libsqlAuthToken = current.storage.libsqlAuthToken;
        }
      }
    } else if (s.mode === 'sqlite') {
      const current = readWorkspaceProfilesFile(root).workspaces.find(workspace => workspace.id === id.trim());
      s =
        current?.storage?.mode === 'sqlite'
          ? current.storage
          : {
              mode: 'sqlite',
              dbPath: path.join(root, 'workspaces', id.trim(), 'mnemo.db'),
              vaultPath: path.join(root, 'workspaces', id.trim(), 'vault'),
            };
    }
    closeDedicatedStores();
    const next = setWorkspaceProfileStorage(root, id.trim(), s);
    if (!next) {
      return { ok: false as const, error: 'Unknown workspace.' };
    }
    return { ok: true as const, profiles: rendererWorkspaceProfiles(next) };
  });

  ipcMain.handle(IPC.WORKSPACE_PROFILES_RENAME, (_event, id: unknown, name: unknown) => {
    const root = getElectronBootstrapRoot();
    if (typeof id !== 'string' || !id.trim()) {
      return { ok: false as const, error: 'Invalid workspace id.' };
    }
    const next = renameWorkspaceProfile(root, id.trim(), typeof name === 'string' ? name : '');
    if (!next) {
      return {
        ok: false as const,
        error: 'Unknown workspace or empty name.',
      };
    }
    return { ok: true as const, profiles: rendererWorkspaceProfiles(next) };
  });
}

app.whenReady().then(async () => {
  runLegacyWorkspaceMigration(app.getPath('userData'));
  setWorkspaceSecretCodec({
    protect: protectSecret,
    unprotect: unprotectSecret,
  });
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) writeConfig(readConfig());
  const profilePath = path.join(app.getPath('userData'), 'workspace-profiles.json');
  if (fs.existsSync(profilePath)) {
    writeWorkspaceProfilesFileDiskOnly(app.getPath('userData'), readWorkspaceProfilesFile(app.getPath('userData')));
  }
  const llmPath = path.join(app.getPath('userData'), 'llm-config.json');
  if (fs.existsSync(llmPath)) writeLlmConfig(app.getPath('userData'), readLlmConfig(app.getPath('userData')));
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

app.on('will-quit', () => {
  mcpServer?.close();
  closeDedicatedStores();
  store?.close();
});

/**
 * Resolve app config and Turso credentials for CLI / MCP — mirrors the GUI (main process).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AppConfig } from '../shared/types';

function configHasRemoteCredentials(cfg: AppConfig): boolean {
  const url = cfg.tursoUrl?.trim() || cfg.libsqlUrl?.trim();
  const token = cfg.tursoToken?.trim() || cfg.libsqlAuthToken?.trim();
  return Boolean(url && token);
}

export function defaultLocalDataDir(): string {
  const fromEnv = process.env['MNEMO_HOME']?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const xdg = process.env['XDG_DATA_HOME'];
  return xdg ? path.join(xdg, 'mnemo') : path.join(os.homedir(), '.local', 'share', 'mnemo');
}

/** Legacy Electron userData before XDG alignment (package name "mnemo"). */
export function legacyElectronUserDataDir(): string {
  const name = 'mnemo';
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', name);
  }
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, name);
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(config, name);
}

/** Electron `app.getPath('userData')` for package name `mnemo-note` (npm package name). */
export function electronDefaultUserDataDirMnemoNote(): string {
  const name = 'mnemo-note';
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', name);
  }
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, name);
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(config, name);
}

/**
 * Bootstrap root for `workspace-profiles.json` and `workspaces/<id>/`: same rules as Electron
 * (MNEMO_HOME, else legacy `mnemo` userData when it holds Turso creds and `mnemo-note` does not).
 */
export function resolveWorkspaceBootstrapRoot(): string {
  const raw = process.env['MNEMO_HOME']?.trim();
  if (raw) return path.resolve(raw);

  const legacyDir = legacyElectronUserDataDir();
  const currentDir = electronDefaultUserDataDirMnemoNote();
  const legacyCfgPath = path.join(legacyDir, 'config.json');
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
    return legacyDir;
  }
  return currentDir;
}

function hasRemoteCredentialsInFile(cfg: AppConfig): boolean {
  return configHasRemoteCredentials(cfg);
}

/**
 * Read config.json from the same places the GUI might use (MNEMO_HOME, XDG data, legacy ~/.config).
 */
export function readAppConfigFile(): AppConfig {
  const paths: string[] = [];
  const home = process.env['MNEMO_HOME']?.trim();
  if (home) paths.push(path.join(path.resolve(home), 'config.json'));
  paths.push(path.join(defaultLocalDataDir(), 'config.json'));
  paths.push(path.join(legacyElectronUserDataDir(), 'config.json'));

  for (const p of paths) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const cfg = JSON.parse(raw) as AppConfig;
      if (hasRemoteCredentialsInFile(cfg)) return cfg;
    } catch {
      /* try next */
    }
  }
  for (const p of paths) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as AppConfig;
    } catch {
      /* try next */
    }
  }
  return {};
}

/** Resolve remote libSQL URL + token from config (Turso- or libsql-prefixed keys) and env aliases. */
export function getRemoteLibsqlCredentials(
  cfg: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
): { url?: string; token?: string } {
  const url =
    cfg.tursoUrl?.trim() ||
    cfg.libsqlUrl?.trim() ||
    env['MNEMO_TURSO_URL']?.trim() ||
    env['MNEMO_LIBSQL_URL']?.trim();
  const token =
    cfg.tursoToken?.trim() ||
    cfg.libsqlAuthToken?.trim() ||
    env['MNEMO_TURSO_TOKEN']?.trim() ||
    env['MNEMO_LIBSQL_AUTH_TOKEN']?.trim();
  return { url, token };
}

/** Same precedence as GUI initStore: argv flags, then config.json, then MNEMO_TURSO_* / MNEMO_LIBSQL_* env. */
export function resolveTursoCredentials(parsed: {
  tursoUrl?: string;
  tursoToken?: string;
}): { tursoUrl?: string; tursoToken?: string } {
  const cfg = readAppConfigFile();
  const fromCfg = getRemoteLibsqlCredentials(cfg);
  const url = parsed.tursoUrl?.trim() || fromCfg.url;
  const token = parsed.tursoToken?.trim() || fromCfg.token;
  return { tursoUrl: url, tursoToken: token };
}

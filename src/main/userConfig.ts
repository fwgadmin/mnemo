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
  // Same flat + nested rules as applyBootstrapRootOnly / readAppConfigFile (not flat-only).
  const legacyRemote = readRemoteConfigFromBootstrapDir(legacyDir) != null;
  const currentRemote = readRemoteConfigFromBootstrapDir(currentDir) != null;
  if (legacyRemote && !currentRemote && legacyDir !== currentDir) {
    return legacyDir;
  }
  return currentDir;
}

function hasRemoteCredentialsInFile(cfg: AppConfig): boolean {
  return configHasRemoteCredentials(cfg);
}

/** Same as `DEFAULT_WORKSPACE_ID` in workspaceProfiles (avoid circular import). */
const WORKSPACE_DEFAULT_ID = 'default';

/**
 * Electron may store Turso creds only under `workspaces/<id>/config.json` when the flat
 * `config.json` has no remote section — see `applyBootstrapRootOnly` in workspaceProfiles.
 */
function configPathsForBootstrapDir(dir: string): [string, string] {
  const flat = path.join(dir, 'config.json');
  const nested = path.join(dir, 'workspaces', WORKSPACE_DEFAULT_ID, 'config.json');
  return [flat, nested];
}

/** Exported for Electron startup redirect (must match CLI bootstrap rules). */
export function readRemoteConfigFromBootstrapDir(dir: string): AppConfig | null {
  const [flat, nested] = configPathsForBootstrapDir(dir);
  try {
    const cfg = JSON.parse(fs.readFileSync(flat, 'utf-8')) as AppConfig;
    if (hasRemoteCredentialsInFile(cfg)) return cfg;
  } catch {
    /* try nested */
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(nested, 'utf-8')) as AppConfig;
    if (hasRemoteCredentialsInFile(cfg)) return cfg;
  } catch {
    /* none */
  }
  return null;
}

function readAnyConfigFromBootstrapDir(dir: string): AppConfig | null {
  for (const p of configPathsForBootstrapDir(dir)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as AppConfig;
    } catch {
      /* try next */
    }
  }
  return null;
}

function bootstrapDirsForConfigSearch(): string[] {
  const dirs: string[] = [];
  const home = process.env['MNEMO_HOME']?.trim();
  if (home) dirs.push(path.resolve(home));
  // Packaged Electron `userData` for npm name `mnemo-note` (was missing — CLI never saw GUI Turso creds).
  dirs.push(electronDefaultUserDataDirMnemoNote());
  dirs.push(defaultLocalDataDir());
  dirs.push(legacyElectronUserDataDir());
  return dirs;
}

/** Prefer the same bootstrap root as workspace-profiles.json, then other candidates. */
function configSearchDirsOrdered(): string[] {
  const bootstrap = resolveWorkspaceBootstrapRoot();
  const rest = bootstrapDirsForConfigSearch();
  const ordered: string[] = [bootstrap];
  for (const d of rest) {
    if (path.resolve(d) !== path.resolve(bootstrap)) {
      ordered.push(d);
    }
  }
  return ordered;
}

/**
 * Read config.json from the same places the GUI might use (MNEMO_HOME, Electron userData,
 * XDG data, legacy ~/.config). Checks flat `config.json` then `workspaces/default/config.json`
 * per directory when looking for Turso credentials.
 */
export function readAppConfigFile(): AppConfig {
  const dirs = configSearchDirsOrdered();
  for (const dir of dirs) {
    const cfg = readRemoteConfigFromBootstrapDir(dir);
    if (cfg) return cfg;
  }
  for (const dir of dirs) {
    const cfg = readAnyConfigFromBootstrapDir(dir);
    if (cfg) return cfg;
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

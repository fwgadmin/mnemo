/**
 * Resolve app config and Turso credentials for CLI / MCP — mirrors the GUI (main process).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AppConfig } from '../shared/types';

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

function hasRemoteCredentialsInFile(cfg: AppConfig): boolean {
  const url = cfg.tursoUrl?.trim() || cfg.libsqlUrl?.trim();
  const token = cfg.tursoToken?.trim() || cfg.libsqlAuthToken?.trim();
  return Boolean(url && token);
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

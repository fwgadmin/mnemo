/**
 * Optional user config for `mnemo note` (JSON output default, etc.).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CliUserConfig {
  /** Default CLI output style when no flag / env overrides. */
  output?: 'text' | 'json';
  /**
   * What happens when `mnemo` is run with no arguments (wrapper only; see MNEMO_CLI_BARE).
   * Default when omitted: recent notes list (top 10).
   */
  bareCommand?: 'recent' | 'gui';
}

export function cliConfigPath(): string {
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'Mnemo', 'cli.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'mnemo', 'cli.json');
}

/** Create ~/.config/mnemo/cli.json (or Windows equivalent) with defaults if missing. */
export function ensureDefaultCliConfig(): void {
  const p = cliConfigPath();
  if (fs.existsSync(p)) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const defaultCfg: CliUserConfig = { output: 'text', bareCommand: 'recent' };
    fs.writeFileSync(p, JSON.stringify(defaultCfg, null, 2) + '\n', 'utf8');
  } catch {
    // Ignore (read-only home, sandbox, etc.); loadCliConfig still returns {}.
  }
}

export function loadCliConfig(): CliUserConfig {
  const p = cliConfigPath();
  if (!fs.existsSync(p)) return {};
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CliUserConfig;
    }
  } catch {
    // ignore invalid JSON
  }
  return {};
}

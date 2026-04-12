#!/usr/bin/env node
/**
 * Dev / npm-bin entry: same dispatch as packaged Linux `mnemo`.
 * MCP and note commands run under Electron as Node so better-sqlite3 matches Electron's ABI.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const cliJs = path.join(root, 'dist', 'mnemo-cli.js');
const httpJs = path.join(root, 'dist', 'mnemo-mcp-http.js');
const electronBin = require('electron');
const nodePath = path.join(root, 'node_modules');

/** Resolves Forge with npm/yarn/pnpm layouts (not only node_modules/@electron-forge/...). */
function resolveForgeCli() {
  try {
    const pkg = require.resolve('@electron-forge/cli/package.json', { paths: [root] });
    return path.join(path.dirname(pkg), 'dist', 'electron-forge.js');
  } catch {
    return path.join(root, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
  }
}
const forgeCli = resolveForgeCli();

let argv = process.argv.slice(2);

/** Same rules as src/main/cliConfig.ts cliConfigPath() — keep in sync. */
function cliConfigPath() {
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'Mnemo', 'cli.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'mnemo', 'cli.json');
}

function readBareCommand() {
  const e = (process.env.MNEMO_CLI_BARE || '').trim().toLowerCase();
  if (e === 'gui' || e === 'recent') return e;
  try {
    const p = cliConfigPath();
    if (!fs.existsSync(p)) return 'recent';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j && j.bareCommand === 'gui') return 'gui';
    if (j && j.bareCommand === 'recent') return 'recent';
  } catch (_) {
    /* ignore */
  }
  return 'recent';
}

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** Route first argv to dist/mnemo-cli.js (Electron as Node). */
function shouldRunVaultCli(argv) {
  if (argv.length === 0) return true;
  const cmd = argv[0];
  if (
    cmd === 'help' ||
    cmd === 'mcp' ||
    cmd === 'note' ||
    cmd === 'completion' ||
    cmd === 'workspace' ||
    cmd === 'add' ||
    cmd === 'a' ||
    cmd === 'find' ||
    cmd === 'f' ||
    cmd === 'search' ||
    cmd === 'import' ||
    cmd === 'graph' ||
    cmd === 'categories' ||
    cmd === 'autolink' ||
    cmd === 'list' ||
    cmd === 'set-category' ||
    cmd === 'category' ||
    cmd === 'compose' ||
    cmd === 'write' ||
    cmd === 'edit'
  ) {
    return true;
  }
  if (/^\d+$/.test(cmd)) return true;
  if (isUuid(cmd)) return true;
  const lc = cmd.toLowerCase();
  if (argv.length === 1 && lc !== 'gui' && lc !== 'mcp-http') return true;
  return false;
}

/** Suppress Node’s built-in punycode DEP0040 when running Electron as Node (comes from deps, not app code). */
function electronNodeOptions() {
  const base = (process.env.NODE_OPTIONS || '').trim();
  const flag = '--disable-warning=DEP0040';
  if (base.includes('DEP0040')) return base;
  return base ? `${base} ${flag}` : flag;
}

function printWrapperHelp() {
  console.log(`Mnemo — command-line notes

Without dist/mnemo-cli.js, only this summary is shown. After: npm run build:cli

GET STARTED
  mnemo help             What to run first (same as mnemo --help)
  mnemo help topics      List help sections (vault, mcp, config, …)
  mnemo help vault       Paths, flags, and every vault command
  mnemo help workspace   Local vault workspaces (CLI)

OTHER
  mnemo gui              Graphical app (see mnemo help desktop after build)
  mnemo mcp              MCP stdio (see mnemo help mcp)
  mnemo mcp-http         HTTP MCP

Build the CLI bundle for full progressive help: npm run build:cli
Source: src/shared/userGuide.ts
`);
}

function runElectronAsNode(script, args) {
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_PATH: nodePath,
    NODE_OPTIONS: electronNodeOptions(),
  };
  const child = spawn(electronBin, [script, ...args], { stdio: 'inherit', cwd: root, env });
  child.on('exit', (code) => process.exit(code ?? 1));
}

function runNode(script, args) {
  const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit', cwd: root });
  child.on('exit', (code) => process.exit(code ?? 1));
}

function runGui(userArgs) {
  const forgeArgs = ['start'];
  if (userArgs.length > 0) {
    forgeArgs.push('--', ...userArgs);
  }

  const runForge = () => {
    const env = { ...process.env };
    // Linux: Chromium aborts before main JS if setuid chrome-sandbox isn’t root-owned.
    // Must set before the Electron binary starts (appendSwitch in main is too late).
    if (process.platform === 'linux') {
      env.ELECTRON_DISABLE_SANDBOX = '1';
    }
    const child = spawn(process.execPath, [forgeCli, ...forgeArgs], {
      stdio: 'inherit',
      cwd: root,
      env,
    });
    child.on('error', (err) => {
      console.error('mnemo gui: failed to run electron-forge:', err.message);
      process.exit(1);
    });
    child.on('exit', (code) => process.exit(code ?? 1));
  };

  if (fs.existsSync(forgeCli)) {
    runForge();
    return;
  }

  const pkgJson = path.join(root, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    console.error(
      'electron-forge not found at',
      forgeCli,
      '\nRun npm install in the mnemo project directory (devDependencies include @electron-forge/cli).',
    );
    process.exit(1);
  }

  console.error('electron-forge CLI not found; trying npm run start …');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npmArgs = ['run', 'start', '--'];
  if (userArgs.length > 0) {
    npmArgs.push(...userArgs);
  }
  const child = spawn(npmCmd, npmArgs, {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
    shell: process.platform === 'win32',
  });
  child.on('error', (err) => {
    console.error('mnemo gui: npm run start failed:', err.message);
    console.error('Install dev dependencies: npm install');
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}

if (argv[0] === '-h' || argv[0] === '--help') {
  if (fs.existsSync(cliJs)) {
    runElectronAsNode(cliJs, ['--help']);
  } else {
    printWrapperHelp();
    console.error('For note/mcp usage details, run: npm run build:cli');
    process.exit(0);
  }
} else if (argv[0] === 'help') {
  if (fs.existsSync(cliJs)) {
    runElectronAsNode(cliJs, argv);
  } else {
    printWrapperHelp();
    console.error('For note/mcp usage details, run: npm run build:cli');
    process.exit(0);
  }
} else if (argv.length === 0) {
  if (readBareCommand() === 'gui') {
    runGui(argv);
  } else if (!fs.existsSync(cliJs)) {
    console.error('Run: npm run build:cli   (missing dist/mnemo-cli.js)');
    process.exit(1);
  } else {
    runElectronAsNode(cliJs, argv);
  }
} else if (argv.length >= 1) {
  const cmd = argv[0];
  const lc = cmd.toLowerCase();
  if (lc === 'mcp-http') {
    if (!fs.existsSync(httpJs)) {
      console.error('Run: npm run build:mcp-http');
      process.exit(1);
    }
    runNode(httpJs, []);
  } else if (lc === 'gui') {
    runGui(argv.slice(1));
  } else if (shouldRunVaultCli(argv)) {
    if (!fs.existsSync(cliJs)) {
      console.error('Run: npm run build:cli   (missing dist/mnemo-cli.js)');
      process.exit(1);
    }
    runElectronAsNode(cliJs, argv);
  } else {
    runGui(argv);
  }
}

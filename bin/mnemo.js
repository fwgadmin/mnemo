#!/usr/bin/env node
/**
 * Dev / npm-bin entry: same dispatch as packaged Linux `mnemo`.
 * MCP and note commands run under Electron as Node so better-sqlite3 matches Electron's ABI.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cliJs = path.join(root, 'dist', 'mnemo-cli.js');
const httpJs = path.join(root, 'dist', 'mnemo-mcp-http.js');
const electronBin = require('electron');
const forgeCli = path.join(root, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const nodePath = path.join(root, 'node_modules');

let argv = process.argv.slice(2);

/** Suppress Node’s built-in punycode DEP0040 when running Electron as Node (comes from deps, not app code). */
function electronNodeOptions() {
  const base = (process.env.NODE_OPTIONS || '').trim();
  const flag = '--disable-warning=DEP0040';
  if (base.includes('DEP0040')) return base;
  return base ? `${base} ${flag}` : flag;
}

function printWrapperHelp() {
  console.log(`Mnemo

Usage:
  mnemo [command] [arguments…]

Commands:
  gui [args…]          Start the desktop app (dev tree: electron-forge start; pass args after -- to Electron)
  note …               Vault CLI (list, show, search, new, import, graph, categories, …)
  completion bash|zsh|fish   Print shell tab-completion script to stdout
  mcp [options]        MCP server on stdio (Cursor, Claude Desktop, …)
  mcp-http             HTTP/SSE MCP for remote libSQL (env: TURSO_*, MCP_API_KEY)

Options:
  -h, --help           Full CLI help (same content as Help → Documentation in the app) when
                       dist/mnemo-cli.js exists (after npm run build:cli)

With no command, the GUI is started (same as "mnemo gui").

Examples:
  mnemo
  mnemo gui
  mnemo note list
  mnemo note list -c "Work/Meetings" -v
  mnemo note search "nginx"
  mnemo note new --title "Todo" --body "- [ ] item" -c General
  mnemo note show 3
  mnemo note import ./doc.md -c "Work/Notes"
  mnemo mcp

Documentation: in-app Help → Documentation; CLI: mnemo --help. Shared source: src/shared/userGuide.ts
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
  if (!fs.existsSync(forgeCli)) {
    console.error('electron-forge not found. Run npm install in the mnemo project directory.');
    process.exit(1);
  }
  const forgeArgs = ['start'];
  if (userArgs.length > 0) {
    forgeArgs.push('--', ...userArgs);
  }
  const child = spawn(process.execPath, [forgeCli, ...forgeArgs], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}

if (argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
  if (fs.existsSync(cliJs)) {
    runElectronAsNode(cliJs, ['--help']);
  } else {
    printWrapperHelp();
    console.error('For note/mcp usage details, run: npm run build:cli');
    process.exit(0);
  }
} else if (argv.length >= 1) {
  const cmd = argv[0];
  if (cmd === 'mcp' || cmd === 'note' || cmd === 'completion') {
    if (!fs.existsSync(cliJs)) {
      console.error('Run: npm run build:cli   (missing dist/mnemo-cli.js)');
      process.exit(1);
    }
    runElectronAsNode(cliJs, argv);
  } else if (cmd === 'mcp-http') {
    if (!fs.existsSync(httpJs)) {
      console.error('Run: npm run build:mcp-http');
      process.exit(1);
    }
    runNode(httpJs, []);
  } else if (cmd === 'gui') {
    runGui(argv.slice(1));
  } else {
    runGui(argv);
  }
} else {
  runGui(argv);
}

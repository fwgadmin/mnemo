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
const mainJs = path.join(root, '.webpack', 'x64', 'main', 'index.js');
const nodePath = path.join(root, 'node_modules');

let argv = process.argv.slice(2);

function runElectronAsNode(script, args) {
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_PATH: nodePath,
  };
  const child = spawn(electronBin, [script, ...args], { stdio: 'inherit', cwd: root, env });
  child.on('exit', (code) => process.exit(code ?? 1));
}

function runNode(script, args) {
  const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit', cwd: root });
  child.on('exit', (code) => process.exit(code ?? 1));
}

if (argv.length >= 1) {
  const cmd = argv[0];
  if (cmd === 'mcp' || cmd === 'note') {
    if (!fs.existsSync(cliJs)) {
      console.error('Run: npm run build:cli   (missing dist/mnemo-cli.js)');
      process.exit(1);
    }
    runElectronAsNode(cliJs, argv);
    return;
  }
  if (cmd === 'mcp-http') {
    if (!fs.existsSync(httpJs)) {
      console.error('Run: npm run build:mcp-http');
      process.exit(1);
    }
    runNode(httpJs, []);
    return;
  }
  if (cmd === 'gui') {
    argv = argv.slice(1);
  }
}

if (!fs.existsSync(mainJs)) {
  console.error('Webpack main not found. Run: npm start once to build, or npm run package');
  process.exit(1);
}

const child = spawn(electronBin, [mainJs, ...argv], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 1));

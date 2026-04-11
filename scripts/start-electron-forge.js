#!/usr/bin/env node
/**
 * Dev entry for `npm start`: set sandbox env before Electron spawns (Linux).
 * In-process app.commandLine.appendSwitch runs too late for Chromium's setuid check.
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
if (process.platform === 'linux') {
  process.env.ELECTRON_DISABLE_SANDBOX = '1';
}

const forgeCli = require.resolve('@electron-forge/cli/dist/electron-forge.js');
const forgeArgs = ['start', ...process.argv.slice(2)];
const child = spawn(process.execPath, [forgeCli, ...forgeArgs], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 1));

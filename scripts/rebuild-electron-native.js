#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron's Node ABI.
 * The mnemo CLI runs with ELECTRON_RUN_AS_NODE; the default npm install
 * compiles native addons for the system Node, which mismatches Electron.
 */
const { execSync } = require('child_process');
const path = require('path');

if (process.env.MNEMO_SKIP_NATIVE_REBUILD === '1') {
  process.exit(0);
}

const root = path.join(__dirname, '..');
let electronVer;
try {
  electronVer = require(path.join(root, 'node_modules', 'electron', 'package.json')).version;
} catch {
  console.warn('rebuild-electron-native: electron not installed yet; skip');
  process.exit(0);
}

execSync(`npx --yes @electron/rebuild -f -w better-sqlite3 --version ${electronVer}`, {
  cwd: root,
  stdio: 'inherit',
});

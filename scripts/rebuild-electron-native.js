#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron's Node ABI.
 * The mnemo CLI runs with ELECTRON_RUN_AS_NODE; the default npm install
 * compiles native addons for the system Node, which mismatches Electron.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const { createRequire } = require('module');
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

// Use the installed @electron/rebuild CLI (declared dependency). `npx @electron/rebuild`
// breaks under `npm install -g` (electron-rebuild not found / flaky npx resolution).
// @electron/rebuild v4 only exports `lib/main.js`; resolve that then use sibling `cli.js`.
let rebuildCli;
try {
  const pkgRequire = createRequire(path.join(root, 'package.json'));
  const mainEntry = pkgRequire.resolve('@electron/rebuild');
  rebuildCli = path.join(path.dirname(mainEntry), 'cli.js');
  if (!fs.existsSync(rebuildCli)) {
    throw new Error('missing lib/cli.js');
  }
} catch {
  console.warn('rebuild-electron-native: @electron/rebuild not installed; skip');
  process.exit(0);
}

execFileSync(process.execPath, [rebuildCli, '-f', '-w', 'better-sqlite3', '--version', electronVer], {
  cwd: root,
  stdio: 'inherit',
});

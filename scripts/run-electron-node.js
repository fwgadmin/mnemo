#!/usr/bin/env node

/** Run a Node entry under Electron's Node ABI (required by the rebuilt better-sqlite3 binary). */
const { spawnSync } = require('child_process');
const path = require('path');

const electronBinary = require('electron');
const [entry, ...args] = process.argv.slice(2);

if (!entry) {
  console.error('Usage: node scripts/run-electron-node.js <entry> [...args]');
  process.exit(2);
}

const result = spawnSync(electronBinary, [path.resolve(entry), ...args], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  console.error(`Electron test process stopped by ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);

#!/usr/bin/env node
/**
 * Enforce that mnemo-note's published tarball explicitly lists README.md + LICENSE.
 * `npm pack` often still includes them by default, but the npmjs.com UI has shown
 * the package page without a README when they were omitted from "files" (v2.1.8).
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (pkg.name !== 'mnemo-note') {
  process.exit(0);
}

const files = Array.isArray(pkg.files) ? pkg.files : [];
const required = ['README.md', 'LICENSE'];

for (const name of required) {
  if (!files.includes(name)) {
    console.error(
      `[mnemo-note] package.json "files" must explicitly include "${name}" (alongside bin, dist, examples). ` +
        'Do not remove README.md or LICENSE to rely on npm defaults—the registry UI may omit the README. ' +
        'See .cursor/rules/mnemo-npm-readme.mdc',
    );
    process.exit(1);
  }
}

for (const name of required) {
  const abs = path.join(__dirname, '..', name);
  if (!fs.existsSync(abs)) {
    console.error(`[mnemo-note] Missing file: ${name}`);
    process.exit(1);
  }
}

console.log('[mnemo-note] package.json files include README.md and LICENSE.');

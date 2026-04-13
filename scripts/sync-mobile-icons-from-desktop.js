#!/usr/bin/env node
/**
 * Regenerate apps/mnemo-mobile/assets/*.png from the desktop Electron brand asset
 * (src/assets/icon.png — same artwork as Windows icon.ico / macOS icon.png).
 *
 * Usage: node scripts/sync-mobile-icons-from-desktop.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src/assets/icon.png');
const mobileDir = path.join(root, 'apps/mnemo-mobile/assets');
const SPLASH_BG = { r: 14, g: 165, b: 233, alpha: 1 }; // matches app.json splash.backgroundColor

async function main() {
  const buf = await sharp(src)
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  await fs.promises.writeFile(path.join(mobileDir, 'icon.png'), buf);
  await fs.promises.writeFile(path.join(mobileDir, 'adaptive-icon.png'), buf);

  const splashInner = await sharp(src)
    .resize(400, 400, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: SPLASH_BG },
  })
    .composite([{ input: splashInner, gravity: 'center' }])
    .png()
    .toFile(path.join(mobileDir, 'splash-icon.png'));

  const fav = await sharp(src)
    .resize(48, 48, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  await fs.promises.writeFile(path.join(mobileDir, 'favicon.png'), fav);

  console.log('Updated apps/mnemo-mobile/assets from', path.relative(root, src));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/* Renders the PNG icon set from the brand SVGs (no text in these, so no fonts needed).
 * Usage (sharp is not a workspace dependency on purpose):
 *   mkdir -p /tmp/beacon-render && npm i --prefix /tmp/beacon-render sharp@0.34.4
 *   NODE_PATH=/tmp/beacon-render/node_modules node brand/scripts/render-icons.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const brand = path.resolve(__dirname, '..');
const out = path.join(brand, 'png');
fs.mkdirSync(out, { recursive: true });

const tile = fs.readFileSync(path.join(brand, 'beacon-mark-accent.svg'), 'utf8');
// iOS and Android apply their own corner mask, so apple-touch and maskable icons are full-bleed squares.
const fullBleed = Buffer.from(tile.replace(' rx="112"', ''));
const ACCENT = '#2F5BFF'; // electric cobalt (tile colour)

const jobs = [
  { src: Buffer.from(tile), file: 'icon-192.png', size: 192 },
  { src: Buffer.from(tile), file: 'icon-512.png', size: 512 },
  { src: fullBleed, file: 'apple-touch-icon.png', size: 180, flatten: ACCENT },
  { src: fullBleed, file: 'icon-maskable-512.png', size: 512, flatten: ACCENT },
  { src: fs.readFileSync(path.join(brand, 'favicon.svg')), file: 'favicon-32.png', size: 32 },
];

(async () => {
  for (const j of jobs) {
    let img = sharp(j.src, { density: 576 }).resize(j.size, j.size);
    if (j.flatten) img = img.flatten({ background: j.flatten });
    await img.png({ compressionLevel: 9 }).toFile(path.join(out, j.file));
    console.log('wrote', path.join('brand/png', j.file));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

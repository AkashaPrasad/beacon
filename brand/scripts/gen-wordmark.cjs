/* Generates brand/beacon-wordmark.svg (live <text>) and brand/beacon-wordmark-outlined.svg (glyph outlines).
 * Usage:
 *   mkdir -p /tmp/beacon-render && npm i --prefix /tmp/beacon-render opentype.js@1.3.4
 *   curl -sSLo /tmp/beacon-render/InstrumentSerif-Regular.ttf \
 *     https://github.com/google/fonts/raw/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf
 *   NODE_PATH=/tmp/beacon-render/node_modules node brand/scripts/gen-wordmark.cjs /tmp/beacon-render/InstrumentSerif-Regular.ttf
 */
const fs = require('node:fs');
const path = require('node:path');
const opentype = require('opentype.js');

const brand = path.resolve(__dirname, '..');
const font = opentype.loadSync(process.argv[2]);
const WORD = 'Beacon';
const size = 112;
const baseline = 112;
const track = -1;

// Mark geometry, copied from beacon-mark.svg (512 master). Bounding box 62.4,46.4 → 465.6,449.6.
const RING = 'M396.7 260.7A160 160 0 1 1 251.3 115.3';
const BEAM = 'M334.3 46.4A248 248 0 0 1 465.6 177.7L322 238.7A92 92 0 0 0 273.3 190Z';
const BOX = { x: 62.4, y: 46.4, w: 403.2, h: 403.2 };

const scale = size / font.unitsPerEm;
const capTop = baseline - (font.tables.os2.sCapHeight / font.unitsPerEm) * size;
// Lockup rule: the mark is 1.12 x cap height and is centred on the cap-height band.
const markH = (baseline - capTop) * 1.12;
const s = +(markH / BOX.h).toFixed(4);
const markTop = (capTop + baseline) / 2 - markH / 2;
const tx = +(-BOX.x * s).toFixed(2);
const ty = +(markTop - BOX.y * s).toFixed(2);
const markRight = BOX.w * s;
const gap = 24;

const glyphs = font.stringToGlyphs(WORD);
const textX = +(markRight + gap - glyphs[0].leftSideBearing * scale).toFixed(2);
const parts = [];
const all = new opentype.Path();
let x = textX;
glyphs.forEach((g, i) => {
  const p = g.getPath(x, baseline, size);
  parts.push(p.toPathData(2));
  all.extend(p);
  x += g.advanceWidth * scale + track;
  if (i < glyphs.length - 1) x += font.getKerningValue(g, glyphs[i + 1]) * scale;
});
const bb = all.getBoundingBox();
const y0 = Math.floor(Math.min(bb.y1, markTop));
const y1 = Math.ceil(Math.max(bb.y2, markTop + markH));
const W = Math.ceil(bb.x2);
const textLength = +(bb.x2 - textX).toFixed(1);

const mark = `  <g transform="translate(${tx} ${ty}) scale(${s})">
    <path d="${RING}" fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round"/>
    <path d="${BEAM}"/>
    <circle cx="237.4" cy="274.6" r="62"/>
  </g>`;
const head = (id) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${y0} ${W} ${y1 - y0}" fill="currentColor" role="img" aria-labelledby="${id}">\n  <title id="${id}">${WORD}</title>`;

fs.writeFileSync(
  path.join(brand, 'beacon-wordmark.svg'),
  `${head('beacon-wordmark-title')}
  <!-- Lockup: mark = 1.12 x cap height, centred on the cap band; gap to word = ${gap} units at word size ${size}. -->
${mark}
  <!-- Instrument Serif 400, ${size}/${track} tracking. textLength pins the measured width so a fallback face cannot overflow.
       Use beacon-wordmark-outlined.svg wherever the webfont is not guaranteed. -->
  <text x="${textX}" y="${baseline}" font-family="'Instrument Serif', Geist, system-ui, sans-serif" font-size="${size}" letter-spacing="${track}" textLength="${textLength}" lengthAdjust="spacingAndGlyphs">${WORD}</text>
</svg>
`,
);
fs.writeFileSync(
  path.join(brand, 'beacon-wordmark-outlined.svg'),
  `${head('beacon-wordmark-outlined-title')}
  <!-- Same lockup as beacon-wordmark.svg with the word as Instrument Serif outlines. -->
${mark}
  <path d="${parts.join('')}"/>
</svg>
`,
);
console.log({ s, tx, ty, textX, textLength, viewBox: [0, y0, W, y1 - y0] });

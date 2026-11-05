// Renders the PWA icons (original pixel art: a tank on a burning mud hill) with headless Chromium.
// Run once after changing the art: `node packages/capture/make-icons.mjs`. Output is committed.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const out = resolve(import.meta.dirname, '../client/public/icons');

// 32×32 art, one char per cell. Palette below.
const ART = [
  '................................',
  '................................',
  '................................',
  '...........................y....',
  '..........................yoy...',
  '.........................yoro...',
  '..........................or....',
  '........................bb......',
  '.......................bb.......',
  '......................bb........',
  '.....................bb.........',
  '................gggggb..........',
  '..............ggGGGGGgg.........',
  '.............gGGGGGGGGGg........',
  '............ggggggggggggg.......',
  '...........kgkgkgkgkgkgkgk......',
  '..........mmkmmkmmkmmkmmkmm.....',
  '........mmmmmmmmmmmmmmmmmmmmm...',
  '......mmmMmmmmmmmMmmmmmmmmMmmmm.',
  '....mmmmmmmmMmmmmmmmmmMmmmmmmmmm',
  '..mmmmMmmmmmmmmmmmmmmmmmmmmmMmmm',
  'mmmmmmmmmmmmmmdmmmmmmMmmmmmmmmmm',
  'mmmMmmmmmdmmmmmmmmmmmmmmmmdmmmmm',
  'mmmmmmmmmmmmmmmmmMmmmmmmmmmmmmmm',
  'mmmmmmdmmmmmmmmmmmmmmmdmmmmmmMmm',
  'ddmmmmmmmmMmmmmdmmmmmmmmmmmmmmmm',
  'dddddmmmmmmmmmmmmmmmMmmmmmdmmmdd',
  'dddddddddmmmmdmmmmmmmmmmmmmddddd',
  'dddddddddddddddddmmmmmddddddddd.',
  'dddddddddddddddddddddddddddddddd',
  'dddddddddddddddddddddddddddddddd',
  'dddddddddddddddddddddddddddddddd',
];
const PAL = {
  '.': '#1b1410',
  m: '#8a5a32',
  M: '#a8703e',
  d: '#5c3a20',
  g: '#4f8a3a',
  G: '#6fb04e',
  k: '#2a1f18',
  b: '#3a2c20',
  y: '#ffd65a',
  o: '#ff7a2f',
  r: '#d63a1c',
};

const browser = await chromium.launch();
const page = await browser.newPage();
const render = (size, pad) =>
  page.evaluate(
    ({ art, pal, size, pad }) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.fillStyle = pal['.'];
      g.fillRect(0, 0, size, size);
      const inner = size - pad * 2;
      const cell = Math.floor(inner / 32);
      const off = Math.floor((size - cell * 32) / 2);
      art.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          g.fillStyle = pal[ch];
          g.fillRect(off + x * cell, off + y * cell, cell, cell);
        }),
      );
      return c.toDataURL('image/png').split(',')[1];
    },
    { art: ART, pal: PAL, size, pad },
  );
const files = {
  'icon-192.png': [192, 0],
  'icon-512.png': [512, 0],
  // maskable: keep the art inside the 80% safe zone
  'icon-maskable-512.png': [512, 52],
  'apple-touch-icon.png': [180, 0],
  'favicon-32.png': [32, 0],
};
for (const [name, [size, pad]] of Object.entries(files)) {
  writeFileSync(resolve(out, name), Buffer.from(await render(size, pad), 'base64'));
  console.log(`wrote ${name}`);
}
await browser.close();

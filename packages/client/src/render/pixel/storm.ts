import { TEMP_COLD, TEMP_HOT, tempChill, tempHeat } from '@mudders/shared';
import type { QuadBatch } from './batch';
import type { AmbientProbe } from './ambient';

/**
 * Temperature storms (§3.4): in freezing air a snowstorm, in scorching air a sandstorm. Purely
 * cosmetic and stateless like the theme weather: every grain's position is a pure function of its
 * index and the render time, snapped to whole map cells. The air is shaded in hard bands (no smooth
 * glow), thickest near the ground, and gust sheets of denser haze roll across with the wind.
 */

export type StormKind = 'snow' | 'sand';

/** Temperatures where a storm starts to show and where it is full strength. */
const SNOW_FROM = TEMP_COLD - 3;
const SAND_FROM = TEMP_HOT + 3;

/** Which storm the air temperature calls for, and how strong (0…1, 0 = none). */
export function stormFor(temp: number): { kind: StormKind; k: number } {
  if (temp <= SNOW_FROM) {
    const from = tempChill(SNOW_FROM);
    return { kind: 'snow', k: Math.min(1, (tempChill(temp) - from) / (1000 - from) + 0.25) };
  }
  if (temp >= SAND_FROM) {
    const from = tempHeat(SAND_FROM);
    return { kind: 'sand', k: Math.min(1, (tempHeat(temp) - from) / (1000 - from) + 0.25) };
  }
  return { kind: 'snow', k: 0 };
}

const PAL = {
  snow: {
    haze: 0xeef4ff,
    sheet: 0xffffff,
    grain: [0xffffff, 0xf0f6ff, 0xd8e6f8] as const,
    streak: 0xffffff,
  },
  sand: {
    haze: 0xc0884a,
    sheet: 0xc89a5c,
    grain: [0xe0bc80, 0xc8985a, 0xa87a40, 0x8a5a30] as const,
    streak: 0xd8b070,
  },
} as const;

/** Integer hash → [0, 1). */
function h01(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 11, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Ground row per 2-cell column, reused between frames. */
let surf = new Int16Array(0);

/**
 * Draw a storm of strength `k` (0…1). `wind` is the sim wind (px/tick², sign = direction); the
 * storm always blows, harder with the wind, rightwards when calm.
 */
export function drawStorm(
  normal: QuadBatch,
  kind: StormKind,
  k: number,
  t: number,
  wind: number,
  probe: AmbientProbe,
  mult: number,
): void {
  if (k <= 0.01) return;
  const pal = PAL[kind];
  const W = probe.width;
  const H = probe.height;
  const dir = wind < 0 ? -1 : 1;
  const gust = Math.min(1.5, Math.abs(wind) * 120);
  const speed = (kind === 'snow' ? 1.6 : 2.2) + gust * 1.6;
  const sand = kind === 'sand';

  // the open air above the ground in each 2-cell column (haze never paints over terrain)
  const cols = W >> 1;
  if (surf.length < cols) surf = new Int16Array(cols);
  for (let c = 0; c < cols; c++) {
    const x = c << 1;
    let y = 0;
    while (y < H && !probe.solid(x, y) && !probe.solid(x + 1, y)) y++;
    surf[c] = y;
  }

  // shade: hard bands, thicker towards the ground (whiteout / brown-out)
  const bands = 4;
  const base = sand ? 0.22 : 0.2;
  const grow = sand ? 0.5 : 0.45;
  for (let b = 0; b < bands; b++) {
    const y0 = Math.floor((H * b) / bands);
    const y1 = Math.floor((H * (b + 1)) / bands);
    const a = k * base * (1 + b * grow);
    let run = -1;
    for (let c = 0; c <= cols; c++) {
      const bottom = c < cols ? Math.min(y1, surf[c]!) : y0;
      // join neighbouring columns with the same bottom into one rect
      if (run >= 0 && (c === cols || bottom !== Math.min(y1, surf[run]!))) {
        const rb = Math.min(y1, surf[run]!);
        if (rb > y0) normal.rect(run << 1, y0, (c - run) << 1, rb - y0, pal.haze, a);
        run = -1;
      }
      if (run < 0 && c < cols) run = c;
    }
  }
  // air pockets below the first ground (under arches, ledges, cave roofs) get the same haze
  for (let c = 0; c < cols; c++) {
    const x = c << 1;
    let y = surf[c]!;
    while (y < H) {
      while (y < H && (probe.solid(x, y) || probe.solid(x + 1, y))) y++;
      const ya = y;
      while (y < H && !probe.solid(x, y) && !probe.solid(x + 1, y)) y++;
      if (y >= H) break; // open to the bottom: the void, not air
      if (y > ya) {
        const b = Math.min(bands - 1, Math.floor((((ya + y) >> 1) * bands) / H));
        normal.rect(x, ya, 2, y - ya, pal.haze, k * base * (1 + b * grow));
      }
    }
  }

  // gust sheets: long stepped slabs of denser haze rolling across with the wind, in the air only
  const sheets = Math.round(3 + k * 5);
  for (let i = 0; i < sheets; i++) {
    const w = Math.round(80 + h01(i, 1) * 140);
    const h = Math.round(8 + h01(i, 2) * (sand ? 26 : 18));
    const span = W + w * 2;
    const x = Math.floor(mod(h01(i, 3) * span + t * speed * 0.55 * dir, span)) - w;
    const top = sand ? 0.3 : 0.08;
    const y = Math.floor(H * (top + h01(i, 4) * (0.75 - top)) + Math.sin(t * 0.01 + i) * 3);
    const a = k * (sand ? 0.2 : 0.26);
    // three nested steps, densest in the middle
    for (let st = 0; st < 3; st++) {
      const iw = Math.round(w * (1 - st * 0.28));
      const ih = Math.max(2, Math.round(h * (1 - st * 0.3)));
      const sx = x + ((w - iw) >> 1);
      const sy = y - (ih >> 1);
      for (let cx = Math.max(0, sx & ~1); cx < Math.min(W, sx + iw); cx += 2) {
        const bottom = Math.min(sy + ih, surf[cx >> 1]!);
        if (bottom > sy) normal.rect(cx, sy, 2, bottom - sy, pal.sheet, a);
      }
    }
  }

  // grains and streaks
  const n = Math.round(k * (sand ? 420 : 520) * (W / 1000) * Math.max(0.4, mult));
  for (let i = 0; i < n; i++) {
    const r0 = h01(i, 5);
    const r1 = h01(i, 6);
    const r2 = h01(i, 7);
    const v = speed * (0.6 + r2 * 0.8);
    const span = W + 40;
    const x = Math.floor(mod(r0 * span + t * v * dir, span)) - 20;
    // sand hugs the ground; snow fills the whole sky
    const yr = sand ? 0.25 + 0.75 * Math.sqrt(r1) : r1;
    const wob = sand ? Math.sin(t * 0.09 + r0 * 50) * 1.5 : Math.sin(t * 0.06 + r0 * 40) * 3;
    const fall = sand ? 0 : mod(t * (0.2 + r2 * 0.3), H * 0.2);
    const y = Math.floor(mod(yr * H + wob + fall, H));
    if (x < 0 || x >= W || probe.solid(x, y)) continue;
    const streak = r2 > (sand ? 0.6 : 0.72);
    if (streak) {
      const len = Math.round(3 + r1 * (sand ? 6 : 5) + gust * 2);
      const x0 = dir > 0 ? x - len : x + 1;
      normal.rect(x0, y, len, 1, pal.streak, (sand ? 0.7 : 0.75) * Math.min(1, k + 0.3));
    } else {
      const c = pal.grain[i % pal.grain.length]!;
      const size = r1 > (sand ? 0.7 : 0.4) ? 2 : 1;
      normal.rect(x, y, size, size, c, 0.95);
    }
  }

  // drifts skimming the ground: short streaks along the surface
  const drifts = Math.round(k * 30 * (W / 1000) * Math.max(0.5, mult));
  for (let i = 0; i < drifts; i++) {
    const r0 = h01(i, 8);
    const v = speed * (0.9 + h01(i, 9) * 0.6);
    const x = Math.floor(mod(r0 * W + t * v * dir, W));
    const y = surf[x >> 1]!;
    if (y >= H || y < 2) continue;
    const len = Math.round(4 + h01(i, 10) * 8);
    const x0 = dir > 0 ? x - len : x + 1;
    normal.rect(x0, y - 1, len, 1, pal.streak, 0.6 * k);
    normal.rect(x0 + (len >> 2), y - 2, len >> 1, 1, pal.streak, 0.35 * k);
  }
}

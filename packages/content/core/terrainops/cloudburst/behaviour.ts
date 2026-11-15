import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** What comes down. */
  water: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** Turns into the round before the first downpour. */
  first: z.number().int().min(0).max(40),
  /** Cells of run-off a tick at the lowest point under the storm, for `pour` ticks a turn. */
  rate: z.number().int().min(1).max(64),
  pour: z.number().int().min(1).max(1200),
  /** Keep the storm this many columns from the map edges. */
  margin: z.number().int().min(0).max(200),
  /** Erosion: slope columns a tick under the storm shaken loose (`steps` slide steps). */
  erode: z.number().int().min(0).max(64),
  steps: z.number().int().min(1).max(15),
  /** Water cells soaking away a tick after the storm (off the top of its pools). */
  soak: z.number().int().min(0).max(64),
  /**
   * The downpour is a storm cell `band` columns wide over one random stretch of the map, and
   * the soaking works through a `soakBand`-wide strip that sweeps under it for `soakTicks` after
   * it. Keeping both narrow keeps the settle region small (a phone can't afford the whole map).
   */
  band: z.number().int().min(8).max(1000),
  soakBand: z.number().int().min(1).max(200),
  soakTicks: z.number().int().min(0).max(5000),
});
type Params = z.infer<typeof params>;

const LAST = 0;
/** Tick the current downpour started, or -1 when none is falling. */
const SINCE = 1;
/** Column the storm cell is centred on this turn. */
const DIR = 2;
/** Tick the soaking after the last storm started, or -1 when done. */
const SOAK = 3;

/**
 * Cloudburst (round twist). From turn `first` on, the start of every turn brings a downpour
 * (the rain itself is the weather's, drawn by the renderer). For `pour` ticks a storm cell `band`
 * columns wide hangs over a random stretch of the map: the run-off under it gathers at its lowest point, `rate`
 * cells of real water a tick, so a pool fills there; and it shakes the
 * steep slopes in its path loose (`erode` columns a tick) so they slump down into the valleys.
 * After the storm the water soaks away, `soak` cells a tick off the top of pools, through a strip
 * that sweeps under it for `soakTicks`. Everything happens in one small region at a time, so a
 * phone can keep up. Never holds up a turn by itself.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.cloudburst',
  version: 2,
  params,
  start(api) {
    return [api.turn, -1, 1, -1];
  },
  step(api, p, inst) {
    const d = inst.data;
    const g = api.grid;
    const W = g.width;
    if (api.turn !== d[LAST]) {
      d[LAST] = api.turn;
      if (api.turn >= p.first) {
        d[SINCE] = api.tick;
        d[DIR] = api.rng.range(Math.min(p.margin, W >> 2), W - 1 - Math.min(p.margin, W >> 2));
        d[SOAK] = -1;
        api.emit('cloudburst', W >> 1, 0, 0, { ticks: p.pour });
      }
    }
    const water = api.mats.cellOf(p.water);
    const m = g.material;
    const since = d[SINCE]!;
    if (since >= 0 && api.tick - since >= p.pour) {
      d[SINCE] = -1;
      d[SOAK] = api.tick;
    }
    // the storm cell hangs over one stretch of the map this turn
    const lo = Math.min(p.margin, W >> 2);
    const hi = W - 1 - lo;
    const band = Math.min(p.band, hi - lo + 1);
    const b0 = Math.max(lo, Math.min(hi + 1 - band, d[DIR]! - (band >> 1)));
    if (d[SINCE]! < 0) {
      const soak = d[SOAK]!;
      if (soak < 0) return 'idle';
      const age = api.tick - soak;
      if (age >= p.soakTicks) {
        d[SOAK] = -1;
        return 'idle';
      }
      // after the storm its pools soak away into the ground, top cells first, through a strip
      // that sweeps back and forth under where the storm hung
      const strip = Math.min(p.soakBand, band);
      const span = Math.max(1, band - strip);
      const pos = age % (2 * span);
      const x0 = b0 + (pos < span ? pos : 2 * span - pos);
      for (let n = 0; n < p.soak; n++) {
        const x = Math.min(W - 1, x0 + api.rng.int(strip));
        const y = g.surfaceY(x);
        if (y >= g.height) continue;
        const i = y * W + x;
        if (m[i] !== water) continue;
        g.clearCell(i);
        g.markDirty(x, y, x, y);
      }
      return 'idle';
    }
    // the run-off under the storm gathers at its lowest point, so a pool fills there
    let low = -1;
    let lowY = -1;
    for (let x = Math.max(lo, b0); x < Math.min(hi + 1, b0 + band); x += 3) {
      const y = g.surfaceY(x);
      if (y < g.height && y > lowY) {
        low = x;
        lowY = y;
      }
    }
    if (low >= 0) {
      for (let n = 0; n < p.rate; n++) {
        const x = Math.max(1, Math.min(W - 2, low + api.rng.range(-3, 3)));
        const y = g.surfaceY(x) - 1;
        if (y < 0) continue;
        const i = y * W + x;
        if (m[i] !== 0) continue;
        m[i] = water;
        g.markDirty(x, y, x, y);
      }
    }
    // and it shakes the steep slopes under it loose: they slump down into the valleys
    for (let n = 0; n < p.erode; n++) {
      const x = b0 + api.rng.int(band);
      if (x < lo + 2 || x > hi - 2) continue;
      const s = g.surfaceY(x);
      if (s >= g.height - 2) continue;
      if (Math.abs(g.surfaceY(x - 2) - g.surfaceY(x + 2)) < 3) continue;
      for (let k = 0; k < 3; k++) {
        const i = (s + k) * W + x;
        const c = m[i]!;
        if (c !== 0 && api.mats.repose[c] !== 0 && g.group[i] === 0) g.cellState[i] = p.steps;
      }
      g.markDirty(x, s, x, s + 2);
    }
    return 'idle';
  },
});

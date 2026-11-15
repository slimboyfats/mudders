import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** What comes down. */
  water: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** Turns into the round before the first downpour. */
  first: z.number().int().min(0).max(40),
  /** Cells of rain a tick, for the first `pour` ticks of every turn. */
  rate: z.number().int().min(1).max(64),
  pour: z.number().int().min(1).max(1200),
  /** Drops start this many rows (both ends inclusive) above the ground they fall on. */
  height: z.tuple([z.number().int().min(1).max(200), z.number().int().min(1).max(200)]),
  /** Keep drops this many columns from the map edges. */
  margin: z.number().int().min(0).max(200),
  /**
   * Erosion: chance a drop landing on a slope washes the ground cell it hits loose as runny
   * `mud`, which runs downhill and sets again further down (the slopes wear down into the valleys).
   */
  mud: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  erode: z.number().min(0).max(1),
  /** Water cells soaking away a tick between downpours (off the top of pools and films). */
  soak: z.number().int().min(0).max(64),
});
type Params = z.infer<typeof params>;

const LAST = 0;
/** Tick the current downpour started, or -1 when none is falling. */
const SINCE = 1;

/**
 * Cloudburst (round twist). From turn `first` on, the start of every turn brings a downpour:
 * for `pour` ticks, `rate` cells of real water a tick drop out of the sky onto random columns.
 * The water is ordinary water, so it lands, runs downhill with the liquid engine and gathers in
 * the low places. Drops landing on a slope sometimes wash the ground they hit loose as runny mud,
 * which runs downhill and sets again lower down, so the slopes wear away into the valleys.
 * Between downpours the water soaks away, `soak` cells a tick off the top of pools and films, so
 * lakes swell with each storm and sink back after it. Never holds up a turn by itself.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.cloudburst',
  version: 1,
  params,
  start(api) {
    return [api.turn, -1];
  },
  step(api, p, inst) {
    const d = inst.data;
    const g = api.grid;
    const W = g.width;
    if (api.turn !== d[LAST]) {
      d[LAST] = api.turn;
      if (api.turn >= p.first) {
        d[SINCE] = api.tick;
        api.emit('cloudburst', W >> 1, 0, 0, { ticks: p.pour });
      }
    }
    const water = api.mats.cellOf(p.water);
    const m = g.material;
    const since = d[SINCE]!;
    if (since >= 0 && api.tick - since >= p.pour) d[SINCE] = -1;
    if (d[SINCE]! < 0) {
      // between downpours the water soaks away into the ground, top cells first
      for (let n = 0; n < p.soak; n++) {
        const x = api.rng.int(W);
        const y = g.surfaceY(x);
        if (y >= g.height) continue;
        const i = y * W + x;
        if (m[i] !== water) continue;
        g.clearCell(i);
        g.markDirty(x, y, x, y);
      }
      return 'idle';
    }
    const mud = api.mats.cellOf(p.mud);
    const erode = Math.round(p.erode * 1024);
    const lo = Math.min(p.margin, W >> 2);
    const hi = W - 1 - lo;
    const h0 = p.height[0];
    const h1 = Math.max(h0, p.height[1]);
    for (let n = 0; n < p.rate; n++) {
      const x = api.rng.range(lo, hi);
      const s = g.surfaceY(x);
      // a drop on a slope washes the ground it hits loose
      if (s < g.height && api.rng.int(1024) < erode) {
        const gi = s * W + x;
        const c = m[gi]!;
        const steep = Math.abs(g.surfaceY(x - 2) - g.surfaceY(x + 2)) >= 2;
        if (steep && c !== 0 && api.mats.repose[c] !== 0 && g.group[gi] === 0) {
          m[gi] = mud;
          g.cellState[gi] = 0;
          g.markDirty(x, s, x, s);
        }
      }
      const y = s - api.rng.range(h0, h1);
      if (y < 0) continue;
      const i = y * W + x;
      if (m[i] !== 0) continue;
      m[i] = water;
      g.markDirty(x, y, x, y);
    }
    return 'idle';
  },
});

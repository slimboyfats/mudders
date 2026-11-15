import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** What rolls in. */
  water: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** Turns into the round before the first wave, and turns between waves. */
  first: z.number().int().min(0).max(40),
  every: z.number().int().min(1).max(40),
  /** Ticks the sea surges in for, and cells it pours in a tick while it does. */
  surge: z.number().int().min(1).max(600),
  rate: z.number().int().min(1).max(200),
  /** Columns of the inflow, starting `margin` columns in from the map edge. */
  band: z.number().int().min(2).max(100),
  margin: z.number().int().min(0).max(100),
  /** The wave stands this many rows above the highest ground within `reach` % of the map inland. */
  reach: z.number().int().min(1).max(100),
  height: z.number().int().min(4).max(200),
  /** Sideways speed the inflow drives its water at, in eighths of a cell per tick. */
  speed: z.number().int().min(1).max(120),
  /** Water cells soaking away a tick between waves (off the top of pools and films). */
  soak: z.number().int().min(0).max(64),
});
type Params = z.infer<typeof params>;

/** Width of the strip the soaking works through. */
const SOAK_STRIP = 24;
const LAST = 0;
/** Tick the current wave started, or -1 when none is rolling in. */
const SINCE = 1;
/** +1: rolling in from the left edge, -1: from the right. */
const DIR = 2;
/** Row the wave's water stands up to in the inflow. */
const CREST = 3;

/**
 * Flood Wave (round twist). From turn `first` on, every `every` turns a wave surges in from one
 * map edge (picked at random): for `surge` ticks a band of columns by the edge fills with real
 * water up to `height` rows over its ground, and everything in the band is driven inland at
 * `speed`. The liquid engine does the rest: the wall of water slumps forward, runs over the
 * ground with its momentum, climbs slopes, pours into the valleys and leaves lakes behind, which
 * soak away `soak` cells a tick until the next wave.
 * Never holds up a turn by itself.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.flood-wave',
  version: 2,
  params,
  start(api) {
    return [api.turn, -1, 1, 0];
  },
  step(api, p, inst) {
    const d = inst.data;
    const g = api.grid;
    const W = g.width;
    const band = Math.min(p.band, W >> 2);
    if (api.turn !== d[LAST]) {
      d[LAST] = api.turn;
      if (api.turn >= p.first && (api.turn - p.first) % p.every === 0) {
        const dir = api.rng.int(2) === 0 ? 1 : -1;
        const x0 = dir > 0 ? p.margin : W - 1 - p.margin - (band - 1);
        // tall enough to top the first ridge inland, so the wave runs on instead of pooling
        let high = g.height;
        const reach = Math.trunc((W * p.reach) / 100);
        for (let k = 0; k < reach; k++) high = Math.min(high, g.surfaceY(x0 + dir * k));
        d[SINCE] = api.tick;
        d[DIR] = dir;
        d[CREST] = Math.max(1, high - p.height);
        api.emit('floodWave', dir > 0 ? x0 : x0 + band - 1, d[CREST]!, band, { dir });
      }
    }
    const water = api.mats.cellOf(p.water);
    const m = g.material;
    const since = d[SINCE]!;
    if (since >= 0 && api.tick - since >= p.surge) d[SINCE] = -1;
    if (d[SINCE]! < 0) {
      // between waves what is left soaks away into the ground, top cells first, through a strip
      // that sweeps back and forth over the map (one small busy region at a time)
      const strip = Math.min(SOAK_STRIP, W);
      const span = Math.max(1, W - strip);
      const pos = api.tick % (2 * span);
      const x0 = pos < span ? pos : 2 * span - pos;
      for (let n = 0; n < p.soak; n++) {
        const x = x0 + api.rng.int(strip);
        const y = g.surfaceY(x);
        if (y >= g.height) continue;
        const i = y * W + x;
        if (m[i] !== water) continue;
        g.clearCell(i);
        g.markDirty(x, y, x, y);
      }
      return 'idle';
    }
    const flow = g.flowVel;
    const dir = d[DIR]!;
    const crest = d[CREST]!;
    const x0 = dir > 0 ? p.margin : W - 1 - p.margin - (band - 1);
    const push = dir * p.speed;
    const per = Math.max(1, Math.trunc(p.rate / band));
    let top = g.height;
    for (let x = x0; x < x0 + band; x++) {
      // pour into the inflow from the bottom of its water up
      for (let n = 0; n < per; n++) {
        const y = g.surfaceY(x) - 1;
        if (y < crest || y < 0) break;
        const i = y * W + x;
        if (m[i] !== 0) break;
        m[i] = water;
      }
      // and drive all of its water inland
      const s = Math.max(crest, g.surfaceY(x));
      if (s < top) top = s;
      for (let y = s; y < g.height; y++) {
        const i = y * W + x;
        if (m[i] !== water) break;
        flow[i] = push;
      }
    }
    if (top < g.height) g.markDirty(x0, top, x0 + band - 1, g.height - 1);
    return 'idle';
  },
});

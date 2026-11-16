import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** What the lakes hold. */
  water: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** Turns into the round before the tide first turns. */
  first: z.number().int().min(0).max(40),
  /** Rows the lakes stand above (high tide) or below (low tide) their level at the start. */
  swing: z.number().int().min(1).max(40),
  /** Turns from one high tide to the next (even). */
  period: z.number().int().min(2).max(40),
  /** Cells a tick the tide brings in or takes out, working one lake at a time for `slice` ticks. */
  rate: z.number().int().min(1).max(32),
  slice: z.number().int().min(10).max(600),
  /** Lakes narrower than this at the start of the round are puddles, not tidal. */
  minWidth: z.number().int().min(2).max(400),
  /** At most this many lakes take part (the widest). */
  lakes: z.number().int().min(1).max(12),
});
type Params = z.infer<typeof params>;

const LAST = 0;
/** Tick this turn's tide started working. */
const SINCE = 1;
/** Rows below its start level each lake should stand at this turn (negative = above). */
const OFFSET = 2;
/** Lakes follow from here, four numbers each: left column, right column, deepest column, level. */
const LAKES = 3;
const X0 = 0;
const X1 = 1;
const MID = 2;
const LEVEL = 3;

/**
 * Tides (Lakeland map event). The lakes in the valleys rise and fall over the round: from turn
 * `first` they swell for a few turns up to `swing` rows above their old shore, then ebb to `swing`
 * rows below it, baring their beds, and back, once every `period` turns. The water is real water,
 * brought in and taken out `rate` cells a tick through one lake at a time, so the shores creep
 * and the liquid engine keeps the surface level. A lake a crater has drained fills again at high
 * tide. Never holds up a turn.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.tides',
  version: 1,
  params,
  start(api, p) {
    const g = api.grid;
    const W = g.width;
    const m = g.material;
    const water = api.mats.cellOf(p.water);
    // the lakes: runs of columns whose surface is water
    const found: number[][] = [];
    let x = 0;
    while (x < W) {
      const y = g.surfaceY(x);
      if (y >= g.height || m[y * W + x] !== water) {
        x++;
        continue;
      }
      const x0 = x;
      let mid = x;
      let deep = -1;
      let level = y;
      while (x < W) {
        const s = g.surfaceY(x);
        if (s >= g.height || m[s * W + x] !== water) break;
        if (s < level) level = s;
        // the deepest point: the lowest bed under the water
        let b = s;
        while (b < g.height && m[b * W + x] === water) b++;
        if (b > deep) {
          deep = b;
          mid = x;
        }
        x++;
      }
      if (x - x0 >= p.minWidth) found.push([x0, x - 1, mid, level]);
    }
    // the widest take part, left to right
    found.sort((a, b) => b[1]! - b[0]! - (a[1]! - a[0]!) || a[0]! - b[0]!);
    const keep = found.slice(0, p.lakes).sort((a, b) => a[0]! - b[0]!);
    const d = [api.turn, -1, 0];
    for (const l of keep) d.push(l[X0]!, l[X1]!, l[MID]!, l[LEVEL]!);
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const g = api.grid;
    const W = g.width;
    const n = (d.length - LAKES) >> 2;
    if (n === 0) return 'idle';
    if (api.turn !== d[LAST]) {
      d[LAST] = api.turn;
      if (api.turn >= p.first) {
        // a triangle wave from low water through the old shore to high water and back
        const P = p.period & ~1;
        const half = P >> 1;
        const phase = (api.turn - p.first + (P >> 2)) % P;
        const up = phase < half ? phase : P - phase;
        const was = d[OFFSET]!;
        d[OFFSET] = -Math.trunc((p.swing * (2 * up - half)) / half);
        d[SINCE] = api.tick;
        // rising 1 = coming in, 0 = going out, 2 = slack water
        const rising = d[OFFSET]! < was ? 1 : d[OFFSET]! > was ? 0 : 2;
        api.emit('tide', W >> 1, 0, 0, { offset: d[OFFSET]!, rising });
      }
    }
    const since = d[SINCE]!;
    if (since < 0) return 'idle';
    const age = api.tick - since;
    if (age >= p.slice * n) return 'idle';
    // one lake at a time keeps the busy region small
    const at = LAKES + 4 * Math.trunc(age / p.slice);
    const x0 = d[at + X0]!;
    const x1 = d[at + X1]!;
    const target = d[at + LEVEL]! + d[OFFSET]!;
    const water = api.mats.cellOf(p.water);
    const m = g.material;
    const mid = d[at + MID]!;
    const top = g.surfaceY(mid);
    const wet = top < g.height && m[top * W + mid] === water;
    if (wet && top === target) return 'idle';
    const span = x1 - x0 + 1;
    if (!wet || top > target) {
      // flood tide: water wells up in the lake
      for (let k = 0; k < p.rate; k++) {
        const x = x0 + api.rng.int(span);
        const y = g.surfaceY(x) - 1;
        if (y < 0 || y < target) continue;
        const i = y * W + x;
        if (m[i] !== 0) continue;
        m[i] = water;
        g.markDirty(x, y, x, y);
      }
    } else {
      // ebb tide: the top of the lake drains away
      for (let k = 0; k < p.rate; k++) {
        const x = x0 + api.rng.int(span);
        const y = g.surfaceY(x);
        if (y >= g.height || y >= target) continue;
        const i = y * W + x;
        if (m[i] !== water) continue;
        g.clearCell(i);
        g.markDirty(x, y, x, y);
      }
    }
    return 'idle';
  },
});

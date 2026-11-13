import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** What floods in. */
  water: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** Turns into the round before the springs open. */
  first: z.number().int().min(0).max(40),
  /** Rows the flood's target climbs each turn, and how far above the lowest ground the first one is. */
  rise: z.number().int().min(1).max(40),
  start: z.number().int().min(0).max(100),
  /** Springs (at the deepest valleys, at least `apart` columns from each other). */
  springs: z.number().int().min(1).max(8),
  apart: z.number().int().min(10).max(1000),
  /** Cells each spring pumps per tick, for at most `pump` ticks from the start of a turn. */
  rate: z.number().int().min(1).max(16),
  pump: z.number().int().min(1).max(1200),
  /** Health a tank with its top under the water loses each turn. */
  damage: z.number().int().min(0).max(100),
});
type Params = z.infer<typeof params>;

const LAST = 0;
/** Row the flood is climbing to this turn (water stops pumping where its surface reaches it). */
const TARGET = 1;
/** Tick the current turn's pumping started, or -1 before the first. */
const SINCE = 2;
/** Lowest ground row on the map at the start of the round. */
const LOW = 3;
/** Spring columns follow from here; -1 = unused. */
const SPRING = 4;

/**
 * Rising Water (round twist). At the start of the round springs are placed in the deepest
 * valleys, well apart. From turn `first` on, each turn raises the flood's target by `rise` rows,
 * and every spring pumps up to `rate` cells a tick into the bottom of its pool for the first
 * `pump` ticks of the turn, until the water there stands at the target. The water is ordinary
 * water, so the pools swell, spread and slosh with the liquid engine instead of jumping a step.
 * A tank whose top is under water at the start of a turn takes `damage`.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.rising-water',
  version: 1,
  params,
  start(api, p) {
    const g = api.grid;
    const W = g.width;
    const surf: number[] = [];
    let low = 0;
    for (let x = 0; x < W; x++) {
      const y = g.surfaceY(x);
      surf.push(y < g.height ? y : -1);
      if (y < g.height && y > low) low = y;
    }
    const d = [api.turn, low, -1, low];
    const taken: number[] = [];
    const margin = 8;
    for (let k = 0; k < p.springs; k++) {
      let best = -1;
      for (let x = margin; x < W - margin; x++) {
        const y = surf[x]!;
        if (y < 0) continue;
        let near = false;
        for (const t of taken) if (Math.abs(t - x) < p.apart) near = true;
        if (near) continue;
        if (best < 0 || y > surf[best]!) best = x;
      }
      if (best < 0) break;
      taken.push(best);
    }
    taken.sort((a, b) => a - b);
    for (let k = 0; k < p.springs; k++) d.push(taken[k] ?? -1);
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const g = api.grid;
    const W = g.width;
    if (api.turn !== d[LAST]) {
      d[LAST] = api.turn;
      if (api.turn >= p.first) {
        const k = api.turn - p.first;
        d[TARGET] = Math.max(0, d[LOW]! - p.start - p.rise * k);
        d[SINCE] = api.tick;
        // a tank whose top is under water at the start of a turn is drowning
        const water = api.mats.cellOf(p.water);
        for (const t of api.tanks) {
          const y = t.y - t.h - 1;
          if (!t.alive || p.damage <= 0 || y < 0 || y >= g.height) continue;
          if (g.material[y * W + t.x] === water) api.hurt(t.player, p.damage, -1);
        }
        api.emit('floodRise', W >> 1, d[TARGET]!, 0, { level: d[TARGET]! });
      }
    }
    const since = d[SINCE]!;
    if (since < 0 || api.tick - since >= p.pump) return 'idle';
    const water = api.mats.cellOf(p.water);
    const m = g.material;
    const target = d[TARGET]!;
    for (let s = SPRING; s < d.length; s++) {
      const x0 = d[s]!;
      if (x0 < 0) continue;
      for (let n = 0; n < p.rate; n++) {
        // the spring's mouth wanders a little so the pool swells instead of growing a needle
        const x = Math.max(1, Math.min(W - 2, x0 + api.rng.range(-2, 2)));
        const top = g.surfaceY(x);
        const y = top - 1;
        if (y <= target || y < 0) continue;
        const i = y * W + x;
        if (m[i] !== 0) continue;
        m[i] = water;
        g.markDirty(x, y, x, y);
      }
    }
    return 'idle';
  },
});

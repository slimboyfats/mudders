import { z } from '@mudders/shared';
import { FP, SETTLE_STATIC, defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** Turns into the round before the first quake. */
  first: z.number().int().min(0).max(40),
  /** How long a quake shakes, and how often it jolts while it does, in ticks. */
  ticks: z.number().int().min(1).max(600),
  pulse: z.number().int().min(1).max(60),
  /** Columns from the epicentre at full strength; past that it fades to a quarter at the edges. */
  reach: z.number().int().min(10).max(2000),
  /** Rows under the surface a jolt shakes loose. */
  depth: z.number().int().min(1).max(40),
  /** Slide steps a shaken cell gets (it slumps off any slope steeper than its material holds). */
  steps: z.number().int().min(1).max(15),
  /** Share of steep columns whose top cells are thrown downhill at a jolt (full strength). */
  slide: z.number().min(0).max(1),
  /** Downhill kick of a thrown cell, cells/tick. */
  kick: z.number().min(0).max(4),
  /** A column is steep when the ground 3 columns either side differs by at least this many rows. */
  steep: z.number().int().min(1).max(40),
});
type Params = z.infer<typeof params>;

const LAST = 0;
/** Tick the current quake started, or -1 when none is shaking. */
const SINCE = 1;
const EPI = 2;

/**
 * Earthquakes (round twist). From turn `first` on, the start of every turn brings a quake from a
 * random epicentre. For `ticks` ticks it jolts every `pulse`: the ground near the surface is
 * shaken loose (its slide steps, like a crater rim) so every slope steeper than its material
 * holds slumps and runs down into the valleys, and on the steepest slopes the top cells are
 * thrown downhill and land as a spreading heap. Strongest within `reach` of the epicentre,
 * felt everywhere. Rock and props hold. Never holds up a turn by itself.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.earthquakes',
  version: 2,
  params,
  start(api) {
    return [api.turn, -1, 0];
  },
  step(api, p, inst) {
    const d = inst.data;
    const g = api.grid;
    const W = g.width;
    if (api.turn !== d[LAST]) {
      d[LAST] = api.turn;
      if (api.turn >= p.first) {
        d[SINCE] = api.tick;
        d[EPI] = api.rng.range(W >> 3, W - 1 - (W >> 3));
        api.emit('earthquake', d[EPI]!, g.surfaceY(d[EPI]!), p.reach, { ticks: p.ticks });
      }
    }
    const since = d[SINCE]!;
    if (since < 0) return 'idle';
    const age = api.tick - since;
    if (age >= p.ticks) {
      d[SINCE] = -1;
      return 'idle';
    }
    if (age % p.pulse !== 0) return 'idle';
    const epi = d[EPI]!;
    const m = g.material;
    const st = g.cellState;
    const mats = api.mats;
    // a jolt fades as the quake dies down
    const fade = 1024 - Math.trunc((age * 768) / p.ticks);
    const slideOdds = Math.round(p.slide * 1024);
    const kick = Math.round(p.kick * FP);
    let minY = g.height;
    // only the ground near the epicentre shakes (keeps the busy region small)
    const x0 = Math.max(0, epi - p.reach);
    const x1 = Math.min(W - 1, epi + p.reach);
    for (let x = x0; x <= x1; x++) {
      const s = g.surfaceY(x);
      if (s >= g.height) continue;
      if (s < minY) minY = s;
      const dist = Math.abs(x - epi);
      const amp =
        ((dist <= p.reach ? 1024 : Math.max(256, 1024 - ((dist - p.reach) * 1024) / p.reach)) *
          fade) >>
        10;
      for (let k = 0; k < p.depth && s + k < g.height; k++) {
        const i = (s + k) * W + x;
        const c = m[i]!;
        if (c === 0 || mats.repose[c] === 0 || g.group[i] !== 0 || st[i] !== 0) continue;
        // deeper rows come loose less often, so a slope sheds its skin, not a slab
        if (api.rng.int(1024) >= amp - k * (amp / p.depth)) continue;
        st[i] = p.steps;
      }
      // the steepest slopes shed their top downhill with real speed
      const l = g.surfaceY(Math.max(0, x - 3));
      const r = g.surfaceY(Math.min(W - 1, x + 3));
      const drop = r - l;
      if (Math.abs(drop) < p.steep || api.rng.int(1024) >= (slideOdds * amp) >> 10) continue;
      const dir = drop > 0 ? 1 : -1;
      for (let k = 0, n = 1 + api.rng.int(3); k < n; k++) {
        const i = (s + k) * W + x;
        const c = m[i]!;
        if (c === 0 || mats.settle[c] === SETTLE_STATIC || g.group[i] !== 0) break;
        const vx = dir * (kick + (api.rng.int(64) << 9));
        api.launch(i, vx, -(api.rng.int(48) << 9));
      }
    }
    if (minY < g.height) g.markDirty(x0, minY, x1, Math.min(g.height - 1, minY + 200));
    api.emit('quake', epi, g.surfaceY(epi), p.reach, { strength: (3 * fade) >> 10 || 1 });
    return 'idle';
  },
});

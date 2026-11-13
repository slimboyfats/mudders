import { ContentIdSchema, z } from '@mudders/shared';
import { FP, defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** The shell each meteor is (a `flight.meteor` weapon: it waits above the map, then streaks in). */
  meteor: ContentIdSchema.refine((id) => id.startsWith('weapon.'), 'must be a weapon.* id'),
  /** Turns into the round before the first meteors come. */
  first: z.number().int().min(0).max(40),
  /** Meteors at the start of each turn (both ends inclusive). */
  count: z.tuple([z.number().int().min(0).max(12), z.number().int().min(0).max(12)]),
  /** How many of them aim at a tank (a random living one), landing within `spread` columns. */
  near: z.number().int().min(0).max(12),
  spread: z.number().int().min(0).max(200),
  /** Keep landings this many columns from the map edges. */
  margin: z.number().int().min(0).max(200),
});
type Params = z.infer<typeof params>;

const LAST = 0;

/**
 * Meteor Night (round twist). At the start of every turn from `first` on, a few meteors come
 * down out of the sky: most anywhere on the map, `near` of them close to a living tank. They are
 * ordinary meteor shells, so they streak in, blast a crater and hurt whoever they hit (no one is
 * credited). Never holds up a turn by itself.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.meteor-night',
  version: 1,
  params,
  start(api) {
    return [api.turn];
  },
  step(api, p, inst) {
    const d = inst.data;
    if (api.turn === d[LAST]) return 'idle';
    d[LAST] = api.turn;
    if (api.turn < p.first) return 'idle';
    const w = api.weaponByIndex(p.meteor);
    if (w < 0) return 'idle';
    const W = api.grid.width;
    const lo = Math.min(p.margin, W >> 2);
    const hi = W - 1 - lo;
    const n = api.rng.range(p.count[0], Math.max(p.count[0], p.count[1]));
    const alive: number[] = [];
    for (const t of api.tanks) if (t.alive) alive.push(t.x);
    let x: number;
    for (let i = 0; i < n; i++) {
      if (i < p.near && alive.length > 0) {
        const tx = alive[api.rng.int(alive.length)]!;
        x = tx + api.rng.range(-p.spread, p.spread);
      } else x = api.rng.range(lo, hi);
      x = Math.max(lo, Math.min(hi, x));
      api.throwShell(w, -1, x * FP + (FP >> 1), 0, 0, 0);
    }
    if (n > 0) api.emit('meteorNight', W >> 1, 0, 0, { count: n });
    return 'idle';
  },
});

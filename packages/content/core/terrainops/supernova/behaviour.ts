import { FP, z } from '@mudders/shared';
import { SETTLE_STATIC, defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Ticks the star burns and pulls before it goes off (time the core's `onTimer` to match). */
  charge: z.number().int().min(10).max(600),
  /** The last this-many ticks of the charge it collapses (stops pulling, shrinks to a point). */
  collapse: z.number().int().min(0).max(120),
  /** Cells it hangs above the ground where it landed. */
  height: z.number().int().min(0).max(120),
  /** Cells a tank anywhere in reach is dragged toward it over the whole charge. */
  tankPull: z.number().int().min(0).max(200),
  /** Highest step (cells) a dragged tank is hauled up; a taller wall stops it. */
  climb: z.number().int().min(0).max(16),
  /** Loose surface cells torn up toward the star per tick at full strength. */
  suck: z.number().int().min(0).max(60),
  /** Flight time of a torn-up cell to the star, ticks. */
  flight: z.number().int().min(4).max(120),
});
type Params = z.infer<typeof params>;

// data slots
const AGE = 0;
const STAR_Y = 1;
const SIZE = 2;

function surface(api: SimApi, x: number): number {
  return api.grid.surfaceY(Math.max(0, Math.min(api.grid.width - 1, x)));
}

/**
 * Supernova (weapon.supernova): a star ignites over the impact point and burns for `charge`
 * ticks, holding up the turn. While it burns it pulls: loose ground all round is torn up and
 * thrown at it (it heaps underneath), and every tank in reach is dragged along the ground toward
 * it, harder the longer it burns. For the last `collapse` ticks it falls in on itself; then the
 * weapon's core goes off (a separate spawned submunition, timed to the same tick).
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.supernova',
  version: 1,
  params,
  start(api, p, c) {
    const d = new Array<number>(SIZE).fill(0);
    d[STAR_Y] = Math.max(8, Math.min(c.y, surface(api, c.x)) - p.height);
    api.emit('supernovaIgnite', c.x, d[STAR_Y], c.radius, { charge: p.charge });
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const c = inst.call;
    const g = api.grid;
    const W = g.width;
    const age = d[AGE]! + 1;
    d[AGE] = age;
    const sy = d[STAR_Y]!;
    const burn = Math.max(1, p.charge - p.collapse);
    const R = c.radius;
    if (age <= burn) {
      // tanks: one cell nearer every so often, more often as it grows
      const every = Math.max(1, Math.trunc((burn * burn) / Math.max(1, 2 * p.tankPull * age)));
      if (p.tankPull > 0 && age % every === 0) {
        for (const t of api.tanks) {
          if (!t.alive || t.glue > 0) continue;
          const dx = c.x - t.x;
          const adx = dx < 0 ? -dx : dx;
          if (adx <= t.half + 4 || adx >= R) continue;
          const nx = t.x + (dx > 0 ? 1 : -1);
          const step = t.y - surface(api, nx);
          if (step > p.climb) continue;
          t.x = nx;
          if (step > 0) t.y -= step;
        }
      }
      // ground: loose surface cells thrown at the star, more of them as it grows
      const n = Math.trunc((p.suck * age) / burn);
      const T = p.flight;
      const half = Math.trunc((api.gravity * T) / 2);
      for (let k = 0; k < n; k++) {
        const off = api.rng.int(2 * R + 1) - R;
        const x = c.x + off;
        if (x < 0 || x >= W || (off > -6 && off < 6)) continue;
        const y = surface(api, x);
        if (y >= g.height) continue;
        const i = y * W + x;
        const m = g.material[i]!;
        if (m === 0 || (api.mats.settle[m] === SETTLE_STATIC && g.group[i] === 0)) continue;
        api.launch(i, Math.trunc(((c.x - x) * FP) / T), Math.trunc(((sy - y) * FP) / T) - half);
      }
    }
    api.emit('supernova', c.x, sy, R, { t: age, charge: p.charge, collapse: p.collapse });
    if (age >= p.charge) {
      api.emit('supernovaBurst', c.x, sy, R, {});
      return false;
    }
    return true;
  },
});

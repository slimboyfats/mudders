import { z } from '@mudders/shared';
import { SETTLE_STATIC, defineTerrainOp, toFixed, type OpCall, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Crest height at the impact point, in cells; it shrinks to nothing at the end of its run. */
  height: z.number().int().min(1).max(64),
  /** Columns the crest moves per tick (each way). */
  speed: z.number().int().min(1).max(16),
  /** Forward and upward speed of the heaved ground, cells/tick. */
  throw: z.number().min(0).max(8),
  lift: z.number().min(0).max(8),
});
type Params = z.infer<typeof params>;

/** Crest height `d` columns out of `R`. */
function amp(p: Params, R: number, d: number): number {
  return d >= R ? 0 : Math.max(1, Math.trunc((p.height * (R - d)) / R));
}

/** Throw up to `n` loose cells off the top of column x, forward along `dir`. */
function heave(api: SimApi, p: Params, x: number, dir: number, n: number): number {
  const g = api.grid;
  const W = g.width;
  if (x < 0 || x >= W) return g.height;
  const top = g.surfaceY(x);
  const vx = dir * toFixed(p.throw);
  for (let k = 0; k < n && top + k < g.height; k++) {
    const i = (top + k) * W + x;
    const m = g.material[i]!;
    // rock and props stop the wave
    if (m === 0 || g.group[i] !== 0 || api.mats.settle[m] === SETTLE_STATIC) break;
    // deeper cells get a smaller kick, so the slab curls over like a breaking wave
    api.launch(i, vx, -toFixed(p.lift) + Math.trunc((k * toFixed(p.lift)) / (2 * n)));
  }
  return top;
}

/** Advance one side's crest from column offset `from` to `to` (exclusive of `from`). */
function advance(api: SimApi, p: Params, c: OpCall, dir: number, from: number, to: number): void {
  const g = api.grid;
  let minY = g.height;
  for (let d = from + 1; d <= to; d++) {
    const y = heave(api, p, c.x + dir * d, dir, amp(p, c.radius, d));
    if (y < minY) minY = y;
  }
  if (minY >= g.height) return;
  const x0 = Math.min(c.x + dir * from, c.x + dir * to);
  const x1 = Math.max(c.x + dir * from, c.x + dir * to);
  g.markDirty(x0 - 1, minY, x1 + 1, g.height - 1);
  // a tank the crest passes under is shoved along with it
  for (const t of api.tanks) {
    if (!t.alive || t.x < x0 || t.x > x1) continue;
    const shove = Math.max(1, amp(p, c.radius, Math.abs(t.x - c.x)) >> 2);
    t.x = Math.max(8, Math.min(g.width - 9, t.x + dir * shove));
  }
}

/**
 * Tectonic wave (§5.1 Tectonic Charge): a horizontal shockwave along the surface. A crest runs
 * out both ways from the impact; in each column it reaches, the top of the ground is heaved
 * forward and up as debris that lands a little further on, where the crest arrives again and
 * throws it on. A wave of dirt rolls across the map, shoving tanks with it, and piles up as a rim
 * where it dies out. Rock and props stop it.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.tectonic',
  version: 1,
  params,
  start(api, p, c) {
    const to = Math.min(c.radius, p.speed);
    advance(api, p, c, -1, 0, to);
    advance(api, p, c, 1, 0, to);
    return to < c.radius ? [to] : null;
  },
  step(api, p, inst) {
    const from = inst.data[0]!;
    const to = Math.min(inst.call.radius, from + p.speed);
    advance(api, p, inst.call, -1, from, to);
    advance(api, p, inst.call, 1, from, to);
    inst.data[0] = to;
    if ((to & 7) === 0) {
      const h = amp(p, inst.call.radius, to);
      api.emit('quake', inst.call.x - to, api.grid.surfaceY(inst.call.x - to), h, { strength: 1 });
      api.emit('quake', inst.call.x + to, api.grid.surfaceY(inst.call.x + to), h, { strength: 1 });
    }
    return to < inst.call.radius;
  },
});

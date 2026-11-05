import { z } from '@mudders/shared';
import { FP, SETTLE_STATIC, defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Rows under the surface that are shaken. */
  depth: z.number().int().min(1).max(32),
  /** Share of shaken loose cells thrown up as debris (the rest are only loosened). */
  chance: z.number().min(0).max(1),
  /** Upward kick of a thrown cell, cells/tick. */
  lift: z.number().min(0).max(4),
  /** Columns the tremor spreads per tick (each way). */
  speed: z.number().int().min(1).max(64),
});
type Params = z.infer<typeof params>;

function shake(api: SimApi, p: Params, x0: number, x1: number): void {
  const g = api.grid;
  const W = g.width;
  const lo = Math.max(0, x0);
  const hi = Math.min(W - 1, x1);
  if (hi < lo) return;
  const odds = Math.round(p.chance * 1024);
  const lift = Math.round(p.lift * FP);
  let minY = g.height;
  for (let x = lo; x <= hi; x++) {
    const s = g.surfaceY(x);
    if (s >= g.height) continue;
    if (s < minY) minY = s;
    for (let k = 0; k < p.depth && s + k < g.height; k++) {
      const i = (s + k) * W + x;
      const m = g.material[i]!;
      if (m === 0 || api.mats.settle[m] === SETTLE_STATIC || g.group[i] !== 0) continue;
      if (api.rng.int(1024) >= odds) continue;
      const vx = (api.rng.int(129) - 64) << 9;
      api.launch(i, vx, -lift - (api.rng.int(64) << 9));
    }
  }
  // everything shaken loose (overhangs, ledges) drops
  if (minY < g.height) g.markDirty(lo, minY, hi, Math.min(g.height - 1, minY + p.depth * 4));
}

/**
 * Earthquake (§5.1): a tremor spreads out both ways from the impact. In every column it reaches,
 * part of the loose ground near the surface is thrown up and the top rows are loosened, so
 * overhangs and ledges collapse and tanks perched on them come down. Rock and props hold.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.quake',
  version: 1,
  params,
  start(api, p, c) {
    const to = Math.min(c.radius, p.speed);
    shake(api, p, c.x - to, c.x + to);
    api.emit('quake', c.x, c.y, c.radius, { strength: 3 });
    return to < c.radius ? [to] : null;
  },
  step(api, p, inst) {
    const c = inst.call;
    const from = inst.data[0]!;
    const to = Math.min(c.radius, from + p.speed);
    shake(api, p, c.x - to, c.x - from - 1);
    shake(api, p, c.x + from + 1, c.x + to);
    inst.data[0] = to;
    return to < c.radius;
  },
});

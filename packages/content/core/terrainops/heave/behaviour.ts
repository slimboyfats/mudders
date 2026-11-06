import { z } from '@mudders/shared';
import { FP, SETTLE_STATIC, defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Heave on every n-th tick only, so the ground bumps rather than boils. */
  every: z.number().int().min(1).max(30),
  /** Rows above the centre the scan starts (clear of the tunnel itself). */
  from: z.number().int().min(0).max(32),
  /** Rows above the centre it still reaches the surface; deeper runs leave it alone. */
  reach: z.number().int().min(1).max(64),
  /** Upward kick at the middle column, cells/tick; it fades to the edges of the radius. */
  lift: z.number().min(0).max(4),
});

/** A tank stands over this column: leave its footing alone (no knocks for a passing tunnel). */
function underTank(api: SimApi, x: number): boolean {
  for (const t of api.tanks) {
    if (t.alive && x >= t.x - t.half - 1 && x <= t.x + t.half) return true;
  }
  return false;
}

/**
 * Heave: the surface over a shallow tunnel hops up and drops back as the digger passes (the drill
 * torpedo's mole run). Per column within the radius, the top loose cell above the tunnel is
 * thrown up a little, hardest over the middle. Emits a `drill` event each heave for the sound.
 */
export default defineTerrainOp<z.infer<typeof params>>({
  kind: 'terrainop',
  id: 'terrainop.heave',
  version: 1,
  params,
  start(api, p, c) {
    if (api.tick % p.every !== 0) return null;
    api.emit('drill', c.x, c.y, c.radius);
    const g = api.grid;
    const W = g.width;
    const R = Math.max(1, c.radius);
    const lift = Math.round(p.lift * FP);
    const settle = api.mats.settle;
    const x0 = Math.max(0, c.x - R);
    const x1 = Math.min(W - 1, c.x + R);
    const yTop = Math.max(0, c.y - p.reach);
    for (let x = x0; x <= x1; x++) {
      if (underTank(api, x)) continue;
      // walk up to the first solid cell with air above it
      for (let y = c.y - p.from; y >= yTop; y--) {
        const i = y * W + x;
        const m = g.material[i]!;
        if (m === 0) continue;
        if (y > 0 && g.material[i - W] !== 0) continue;
        if (settle[m] === SETTLE_STATIC || g.group[i] !== 0) break;
        const d = Math.abs(x - c.x);
        const v = lift - Math.trunc((lift * d) / (R + 1)) + (api.rng.int(64) << 8);
        const vx = (api.rng.int(65) - 32) << 9;
        api.launch(i, vx, -v);
        break;
      }
    }
    return null;
  },
});

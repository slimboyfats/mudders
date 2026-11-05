import { z } from '@mudders/shared';
import { NUM_DAMAGE_TYPES, defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({});

/**
 * Remove cells in a disc. A cell at distance d survives if d × strength > radius, so rock
 * (blast 2) is carved at half the radius and strength 0 is always destroyed (§4.2, §4b).
 */
export default defineTerrainOp<z.infer<typeof params>>({
  kind: 'terrainop',
  id: 'terrainop.carve',
  version: 1,
  params,
  start(api, _p, c) {
    const { grid, mats } = api;
    const W = grid.width;
    const R = c.radius;
    const r2s = R * R * 65536;
    const x0 = Math.max(0, c.x - R);
    const x1 = Math.min(W - 1, c.x + R);
    const y0 = Math.max(0, c.y - R);
    const y1 = Math.min(grid.height - 1, c.y + R);
    const mat = grid.material;
    const str = mats.strength;
    const nd = NUM_DAMAGE_TYPES;
    for (let y = y0; y <= y1; y++) {
      const dy = y - c.y;
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        const m = mat[i]!;
        if (m === 0) continue;
        const dx = x - c.x;
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const s = str[m * nd + c.damageTypeIndex]!;
        if (s !== 0 && d2 * s * s > r2s) continue;
        mat[i] = 0;
        grid.coating[i] = 0;
        grid.cellState[i] = 0;
        grid.fallVel[i] = 0;
      }
    }
    grid.markDirty(x0, y0, x1, y1);
    return null;
  },
});

import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  gas: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** Share of the disc's air cells that get gas, picked by a fixed per-cell hash (ragged cloud). */
  fill: z.number().min(0).max(1).default(0.8),
});

/**
 * Release a cloud of gas (§4b): puts a gas material into the air cells of a disc, as a ragged
 * cloud (`fill`). The gas then rises, drifts and reacts on its own. No PRNG draws.
 */
export default defineTerrainOp<z.infer<typeof params>>({
  kind: 'terrainop',
  id: 'terrainop.gas-cloud',
  version: 1,
  params,
  start(api, p, c) {
    const { grid } = api;
    const W = grid.width;
    const g = api.mats.cellOf(p.gas);
    if (api.mats.gasLift[g] === 0) return null;
    const R = c.radius;
    const cut = Math.round(p.fill * 256);
    const x0 = Math.max(0, c.x - R);
    const x1 = Math.min(W - 1, c.x + R);
    const y0 = Math.max(0, c.y - R);
    const y1 = Math.min(grid.height - 1, c.y + R);
    const mat = grid.material;
    for (let y = y0; y <= y1; y++) {
      const dy = y - c.y;
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        const dx = x - c.x;
        if (mat[i] !== 0 || dx * dx + dy * dy > R * R) continue;
        const h = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77)) >>> 24;
        if (h < cut) grid.putGas(i, g);
      }
    }
    return null;
  },
});

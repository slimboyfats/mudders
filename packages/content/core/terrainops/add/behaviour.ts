import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  material: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
});

/** Fill the air cells of a disc with a material (§4.4). Buries tanks; settle takes it from there. */
export default defineTerrainOp<z.infer<typeof params>>({
  kind: 'terrainop',
  id: 'terrainop.add',
  version: 1,
  params,
  start(api, p, c) {
    const { grid } = api;
    const W = grid.width;
    const cell = api.mats.cellOf(p.material);
    const R = c.radius;
    const x0 = Math.max(0, c.x - R);
    const x1 = Math.min(W - 1, c.x + R);
    const y0 = Math.max(0, c.y - R);
    const y1 = Math.min(grid.height - 1, c.y + R);
    const mat = grid.material;
    for (let y = y0; y <= y1; y++) {
      const dy = y - c.y;
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        const dx = x - c.x;
        if (mat[i] === 0 && dx * dx + dy * dy <= R * R) mat[i] = cell;
      }
    }
    grid.markDirty(x0, y0, x1, y1);
    return null;
  },
});

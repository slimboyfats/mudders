import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  coating: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** How many cells below the open air the coating soaks in. */
  depth: z.number().int().min(1).max(16),
});

/**
 * Coat the terrain's exposed skin inside a disc (§4b): every solid cell within `depth` cells
 * below air gets the coating in the secondary layer; the base material is untouched. Columns are
 * scanned top-down so overhangs and tunnel roofs are coated where air touches them.
 */
export default defineTerrainOp<z.infer<typeof params>>({
  kind: 'terrainop',
  id: 'terrainop.coat',
  version: 1,
  params,
  start(api, p, c) {
    const { grid, mats } = api;
    const coat = mats.cellOf(p.coating);
    const W = grid.width;
    const R = c.radius;
    const x0 = Math.max(0, c.x - R);
    const x1 = Math.min(W - 1, c.x + R);
    const y0 = Math.max(0, c.y - R);
    const y1 = Math.min(grid.height - 1, c.y + R);
    const mat = grid.material;
    for (let x = x0; x <= x1; x++) {
      const dx = x - c.x;
      let run = y0 > 0 && mat[(y0 - 1) * W + x] !== 0 ? p.depth : 0;
      for (let y = y0, i = y0 * W + x; y <= y1; y++, i += W) {
        if (mat[i] === 0) {
          run = 0;
          continue;
        }
        run++;
        const dy = y - c.y;
        if (run > p.depth || dx * dx + dy * dy > R * R) continue;
        grid.coating[i] = coat;
      }
    }
    grid.markDirty(x0, y0, x1, y1);
    api.emit('coat', c.x, c.y, R, {});
    return null;
  },
});

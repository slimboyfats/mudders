import { z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** Hit points of the dummy: blasts and zaps wear it down, and it pops at 0. */
  hp: z.number().int().min(1).max(500),
});

/**
 * Decoy: unfolds a dummy tank (a kernel lure) standing on the ground at the impact column, on the
 * shooter's team. Shells hit it, blasts hurt it, homing warheads and bots take it for a real tank.
 */
export default defineTerrainOp<z.infer<typeof params>>({
  kind: 'terrainop',
  id: 'terrainop.decoy',
  version: 1,
  params,
  start(api, p, c) {
    const g = api.grid;
    const x = Math.max(0, Math.min(g.width - 1, c.x));
    api.addLure(x, g.surfaceY(x), c.owner, p.hp);
    return null;
  },
});

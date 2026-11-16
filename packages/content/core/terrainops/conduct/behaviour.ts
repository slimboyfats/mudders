import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** What carries the charge (water, mud). */
  through: z
    .array(ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'))
    .min(1)
    .max(8),
  /** Most cells the charge spreads through (a big lake carries it this far and no further). */
  cells: z.number().int().min(1).max(200_000),
  /** Health a tank touching the charged water loses (its shield soaks it like any hit). */
  damage: z.number().int().min(0).max(200),
  /** Spark bursts along the charged water's surface, at most. */
  sparks: z.number().int().min(0).max(40),
});
type Params = z.infer<typeof params>;

/** Breadth-first queue and visited mask, grown to the grid and reused (no per-call allocation). */
let queue = new Int32Array(0);
let seen = new Uint8Array(0);
const conductor = new Uint8Array(256);

/**
 * Conduct: an electric charge (a lightning strike) that lands in or beside water runs through
 * all of the water joined to it, up to `cells` cells, and every tank touching that water takes
 * `damage`, credited to the shooter. Sparks crawl along the charged surface. Dry ground and air
 * stop it, so a tank on the bank of a struck lake is hit only if its treads are in the water.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.conduct',
  version: 2,
  params,
  start(api, p, c) {
    const g = api.grid;
    const W = g.width;
    const H = g.height;
    const m = g.material;
    if (queue.length < Math.min(p.cells, g.size)) queue = new Int32Array(Math.min(p.cells, g.size));
    if (seen.length !== g.size) seen = new Uint8Array(g.size);
    conductor.fill(0);
    for (const id of p.through) conductor[api.mats.cellOf(id)] = 1;
    conductor[0] = 0;
    // the charge enters the conducting cells within the radius
    let n = 0;
    const R = Math.max(1, c.radius);
    for (let y = Math.max(0, c.y - R); y <= Math.min(H - 1, c.y + R) && n < p.cells; y++) {
      for (let x = Math.max(0, c.x - R); x <= Math.min(W - 1, c.x + R) && n < p.cells; x++) {
        const i = y * W + x;
        const dx = x - c.x;
        const dy = y - c.y;
        if (dx * dx + dy * dy > R * R || conductor[m[i]!] === 0 || seen[i] !== 0) continue;
        seen[i] = 1;
        queue[n++] = i;
      }
    }
    if (n === 0) return null;
    // and runs through everything joined to them
    for (let h = 0; h < n && n < p.cells; h++) {
      const i = queue[h]!;
      const x = i % W;
      if (x > 0 && seen[i - 1] === 0 && conductor[m[i - 1]!] !== 0) {
        seen[i - 1] = 1;
        queue[n++] = i - 1;
      }
      if (x < W - 1 && n < p.cells && seen[i + 1] === 0 && conductor[m[i + 1]!] !== 0) {
        seen[i + 1] = 1;
        queue[n++] = i + 1;
      }
      if (i >= W && n < p.cells && seen[i - W] === 0 && conductor[m[i - W]!] !== 0) {
        seen[i - W] = 1;
        queue[n++] = i - W;
      }
      if (i + W < g.size && n < p.cells && seen[i + W] === 0 && conductor[m[i + W]!] !== 0) {
        seen[i + W] = 1;
        queue[n++] = i + W;
      }
    }
    // tanks with any part (or the cells just around it) in charged water are shocked
    for (const t of api.tanks) {
      if (!t.alive || p.damage <= 0) continue;
      let hit = false;
      for (let y = Math.max(0, t.y - t.h - 1); y <= Math.min(H - 1, t.y + 1) && !hit; y++) {
        for (let x = Math.max(0, t.x - t.half - 1); x <= Math.min(W - 1, t.x + t.half + 1); x++) {
          if (seen[y * W + x] !== 0) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        api.hurt(t.player, p.damage, c.owner, 'shock');
        api.emit('arcs', t.x, t.y - (t.h >> 1), 6, { strength: 0.6 });
      }
    }
    // sparks crawl along the charged surface, spread evenly over it
    let surf = 0;
    for (let h = 0; h < n; h++) {
      const i = queue[h]!;
      if (i >= W && m[i - W] === 0) surf++;
    }
    const every = Math.max(1, Math.ceil(surf / Math.max(1, p.sparks)));
    let k = 0;
    for (let h = 0; h < n; h++) {
      const i = queue[h]!;
      if (i < W || m[i - W] !== 0) continue;
      if (k++ % every !== 0) continue;
      const x = i % W;
      api.emit('arcs', x, (i - x) / W, 4, { strength: 0.5 });
    }
    api.emit('charge', c.x, c.y, n, { cells: n });
    for (let h = 0; h < n; h++) seen[queue[h]!] = 0;
    return null;
  },
});

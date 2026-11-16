import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const MaterialId = ContentIdSchema.refine(
  (id) => id.startsWith('material.'),
  'must be a material.* id',
);

const params = z
  .strictObject({
    /** What carries the charge, by id (water, mud). */
    through: z.array(MaterialId).min(1).max(8).optional(),
    /** What carries the charge, by tag: every material tagged this (`conducts`: water, steel). */
    tag: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .optional(),
    /** Most cells the charge spreads through (a big lake carries it this far and no further). */
    cells: z.number().int().min(1).max(200_000),
    /**
     * How far the charge runs from where it entered, in cost units: each conducting cell it steps
     * into costs its `cost` (default `step`), so a good conductor carries it farther. Unset = no
     * limit but `cells`.
     */
    reach: z.number().int().min(1).max(4000).optional(),
    /** Cost of a step into a conducting cell not listed in `cost`. */
    step: z.number().int().min(1).max(16).default(1),
    /** Per material cost of a step (steel 1 runs far, water 3 a third as far). */
    cost: z
      .array(z.strictObject({ material: MaterialId, cost: z.number().int().min(1).max(16) }))
      .max(8)
      .default([]),
    /** Health a tank touching the charged cells loses (its shield soaks it like any hit). */
    damage: z.number().int().min(0).max(200),
    /** Spark bursts along the charged water's surface, at most. */
    sparks: z.number().int().min(0).max(40),
    /** Single-cell spark crawls along the charged conductor (`sparkCrawl` events), at most. */
    crawls: z.number().int().min(0).max(40).default(0),
  })
  .refine((p) => p.through !== undefined || p.tag !== undefined, 'needs `through` or `tag`');
type Params = z.infer<typeof params>;

/** Breadth-first queue, visited mask and path cost, grown to the grid and reused (no per-call allocation). */
let queue = new Int32Array(0);
let seen = new Uint8Array(0);
let dist = new Uint16Array(0);
/** Step cost per cell byte; 0 = does not conduct. */
const stepCost = new Uint8Array(256);

/**
 * Conduct: an electric charge (a lightning strike) that lands in or beside a conductor (water,
 * runny mud, steel girders) runs through everything conducting joined to it, up to `cells` cells
 * and `reach` cost units from where it entered (steel carries it farther than water), and every
 * tank touching the charged cells takes `damage`, credited to the shooter. Sparks crawl along the
 * charged conductor. Dry ground and air stop it, so a tank on the bank of a struck lake is hit
 * only if its treads are in the water, and one leaning on a struck girder frame is hit.
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
    const cap = Math.min(p.cells, g.size);
    if (queue.length < cap) queue = new Int32Array(cap);
    if (seen.length !== g.size) {
      seen = new Uint8Array(g.size);
      dist = new Uint16Array(g.size);
    }
    stepCost.fill(0);
    if (p.through !== undefined) for (const id of p.through) stepCost[api.mats.cellOf(id)] = p.step;
    if (p.tag !== undefined)
      for (const cell of api.mats.cellsTagged(p.tag)) stepCost[cell] = p.step;
    for (const k of p.cost) {
      const cell = api.mats.cellOf(k.material);
      if (stepCost[cell] !== 0) stepCost[cell] = k.cost;
    }
    stepCost[0] = 0;
    const reach = p.reach ?? 65535;
    // the charge enters the conducting cells within the radius
    let n = 0;
    const R = Math.max(1, c.radius);
    for (let y = Math.max(0, c.y - R); y <= Math.min(H - 1, c.y + R) && n < cap; y++) {
      for (let x = Math.max(0, c.x - R); x <= Math.min(W - 1, c.x + R) && n < cap; x++) {
        const i = y * W + x;
        const dx = x - c.x;
        const dy = y - c.y;
        if (dx * dx + dy * dy > R * R || stepCost[m[i]!] === 0 || seen[i] !== 0) continue;
        seen[i] = 1;
        dist[i] = 0;
        queue[n++] = i;
      }
    }
    if (n === 0) return null;
    // and runs through everything joined to them, as far as its reach
    for (let h = 0; h < n && n < cap; h++) {
      const i = queue[h]!;
      const d = dist[i]!;
      const x = i % W;
      for (let k = 0; k < 4 && n < cap; k++) {
        let j: number;
        if (k === 0) {
          if (x === 0) continue;
          j = i - 1;
        } else if (k === 1) {
          if (x === W - 1) continue;
          j = i + 1;
        } else if (k === 2) {
          if (i < W) continue;
          j = i - W;
        } else {
          if (i + W >= g.size) continue;
          j = i + W;
        }
        if (seen[j] !== 0) continue;
        const s = stepCost[m[j]!]!;
        if (s === 0 || d + s > reach) continue;
        seen[j] = 1;
        dist[j] = d + s;
        queue[n++] = j;
      }
    }
    // tanks with any part (or the cells just around it) on a charged cell are shocked
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
        api.hurt(t.player, p.damage, c.owner);
        api.emit('arcs', t.x, t.y - (t.h >> 1), 6, { strength: 0.6 });
      }
    }
    // sparks crawl along the charged surface of liquids, spread evenly over it
    let surf = 0;
    for (let h = 0; h < n; h++) {
      const i = queue[h]!;
      if (i >= W && m[i - W] === 0 && api.mats.wet[m[i]!] !== 0) surf++;
    }
    if (surf > 0 && p.sparks > 0) {
      const every = Math.max(1, Math.ceil(surf / p.sparks));
      let k = 0;
      for (let h = 0; h < n; h++) {
        const i = queue[h]!;
        if (i < W || m[i - W] !== 0 || api.mats.wet[m[i]!] === 0) continue;
        if (k++ % every !== 0) continue;
        const x = i % W;
        api.emit('arcs', x, (i - x) / W, 4, { strength: 0.5 });
      }
    }
    // and single-cell sparks run through the conductor itself, later the farther they are
    if (p.crawls > 0) {
      const every = Math.max(1, Math.ceil(n / p.crawls));
      for (let h = 0; h < n; h += every) {
        const i = queue[h]!;
        const x = i % W;
        api.emit('sparkCrawl', x, (i - x) / W, 0, { mat: m[i]!, d: dist[i]!, len: 24 });
      }
    }
    api.emit('charge', c.x, c.y, n, { cells: n });
    for (let h = 0; h < n; h++) seen[queue[h]!] = 0;
    return null;
  },
});

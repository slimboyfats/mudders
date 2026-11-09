import { z } from '@mudders/shared';
import { FP, NUM_DAMAGE_TYPES, defineTerrainOp, type OpCall, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Height of the slab above the impact row at the centre, cells; it thins to 0 at the radius. */
  height: z.number().int().min(1).max(200),
  /** Depth of the cut below the impact row at the centre, cells (scaled the same way). */
  depth: z.number().int().min(0).max(40),
  /** Ticks for the blast to race from the centre out to the radius on both sides. */
  expandTicks: z.number().int().min(1).max(120),
  /** Ground tougher than this (strength against the damage type, 1 = dirt) holds: rock shields. */
  maxStrength: z.number().min(0).max(64),
  /** Share of the shaved cells thrown sideways as debris (the rest is blown to nothing). */
  spray: z.number().min(0).max(1),
  /** Sideways speed of that debris right at the centre, cells/tick; falls off to a third at the rim. */
  speed: z.number().min(0).max(16),
  /** Upward kick as a share of the sideways speed. */
  lift: z.number().min(0).max(2),
});
type Params = z.infer<typeof params>;

/** Per-cell hash in [0, 256): which cells fly, without consuming match RNG. */
function h8(i: number): number {
  let h = Math.imul(i ^ 0x5bd1e995, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  return (h >>> 13) & 255;
}

/**
 * Cut the columns at horizontal distances [d0, d1) on both sides of the centre: everything in the
 * slab from `height` above the impact row to `depth` below it (both thinning as 1 − (d/R)², a very
 * flat lens) is shaved off. A share of it is thrown outward as debris, the rest is gone. Ground
 * tougher than `maxStrength` holds, and so does anything static outside a prop group; prop cells
 * (houses, trees) are torn off and thrown.
 */
function cut(api: SimApi, p: Params, c: OpCall, d0: number, d1: number): void {
  const { grid, mats } = api;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const str = mats.strength;
  const R = c.radius;
  const RR = R * R;
  const dt = c.damageTypeIndex;
  const maxS = Math.round(p.maxStrength * 256);
  const spray = Math.round(p.spray * 256);
  const speed = p.speed * FP;
  let x0 = W;
  let x1 = -1;
  let yTop = H;
  for (let d = d0; d < d1 && d <= R; d++) {
    const lens = RR - d * d; // ×RR
    const up = Math.trunc((p.height * lens) / RR);
    const down = Math.trunc((p.depth * lens) / RR);
    const v = Math.trunc((speed * (R + 2 * (R - d))) / (3 * R));
    const yA = Math.max(0, c.y - up);
    const yB = Math.min(H - 1, c.y + down);
    for (let side = 0; side < 2; side++) {
      if (d === 0 && side === 1) break;
      const x = side === 0 ? c.x + d : c.x - d;
      if (x < 0 || x >= W) continue;
      const dir = side === 0 ? 1 : -1;
      for (let y = yA, i = yA * W + x; y <= yB; y++, i += W) {
        const m = mat[i]!;
        if (m === 0) continue;
        const prop = grid.group[i] !== 0;
        // tough ground (rock, ice) holds; props are torn off whatever they're made of
        if (!prop && str[m * NUM_DAMAGE_TYPES + dt]! > maxS) continue;
        if (prop || h8(i) < spray) {
          // flatter near the top of the slab: the sheet of dirt skims off sideways
          const lift = Math.trunc((v * p.lift * (y - yA + 1)) / (yB - yA + 2));
          if (api.launch(i, dir * v, -lift)) continue;
        }
        if (prop) grid.leaveGroup(i);
        mat[i] = 0;
        grid.coating[i] = 0;
        grid.cellState[i] = 0;
        grid.fallVel[i] = 0;
      }
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      yTop = Math.min(yTop, yA);
    }
    if (d % 6 === 0) {
      const h = Math.max(2, up);
      api.emit('shaveFront', c.x + d, c.y - (h >> 1), h, { dir: 1, speed: p.speed });
      if (d > 0) api.emit('shaveFront', c.x - d, c.y - (h >> 1), h, { dir: -1, speed: p.speed });
    }
  }
  if (x1 >= x0) grid.markDirty(x0, yTop, x1, Math.min(H - 1, c.y + p.depth));
}

/**
 * Shave (§4a, Daisy Cutter): a flat blast that races out sideways from the impact over
 * `expandTicks` ticks and shaves off every hill in its path down to the impact's height, leaving
 * the ground flat. Debris flies outward in a low sheet.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.shave',
  version: 1,
  params,
  start(api, p, c) {
    const step = Math.max(1, Math.ceil(c.radius / p.expandTicks));
    cut(api, p, c, 0, step);
    return step <= c.radius ? [step] : null;
  },
  step(api, p, inst) {
    const R = inst.call.radius;
    const d0 = inst.data[0]!;
    const d1 = d0 + Math.max(1, Math.ceil(R / p.expandTicks));
    cut(api, p, inst.call, d0, d1);
    inst.data[0] = d1;
    return d1 <= R;
  },
});

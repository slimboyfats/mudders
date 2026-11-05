import { FP, z } from '@mudders/shared';
import {
  NUM_DAMAGE_TYPES,
  SETTLE_STATIC,
  defineTerrainOp,
  type OpCall,
  type SimApi,
} from '@mudders/sim';

const params = z.strictObject({
  /** Ticks for the ring to sweep from the rim to the centre. */
  expandTicks: z.number().int().min(1).max(120),
  /** Flight time of each pulled cell; they are aimed to land on the centre. */
  flightTicks: z.number().int().min(4).max(120),
  /** Cells are only pulled from up to this fraction of the radius above/below the centre. */
  depth: z.number().min(0.1).max(1),
  /** Tanks in range are dragged this many cells toward the centre (at the centre: 0). */
  tankPull: z.number().int().min(0).max(200),
});
type Params = z.infer<typeof params>;

const MIN_STRENGTH = 32;

function ring(api: SimApi, p: Params, c: OpCall, r0: number, r1: number): void {
  const { grid, mats } = api;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const R = c.radius;
  const T = p.flightTicks;
  const reach = Math.round(R * p.depth);
  const half = Math.trunc((api.gravity * T) / 2);
  for (
    let y = Math.max(0, c.y - Math.min(r1, reach));
    y <= Math.min(H - 1, c.y + Math.min(r1, reach));
    y++
  ) {
    const dy = y - c.y;
    for (let x = Math.max(0, c.x - r1); x <= Math.min(W - 1, c.x + r1); x++) {
      const dx = x - c.x;
      const d2 = dx * dx + dy * dy;
      if (d2 < r0 * r0 || d2 >= r1 * r1) continue;
      const i = y * W + x;
      const m = mat[i]!;
      if (m === 0 || mats.settle[m] === SETTLE_STATIC) continue;
      // harder materials hold on: strength 2 only moves from the outer half, etc.
      const s = Math.max(MIN_STRENGTH, mats.strength[m * NUM_DAMAGE_TYPES + c.damageTypeIndex]!);
      if (Math.sqrt(d2) * s > R * 256 * 1.5) continue;
      // only cells that can see the sky over them leave first; buried ones follow next tick
      if (y > 0 && mat[i - W] !== 0) continue;
      api.launch(i, Math.trunc((-dx * FP) / T), Math.trunc((-dy * FP) / T) - half);
    }
  }
  grid.markDirty(c.x - r1, c.y - r1, c.x + r1, c.y + r1);
}

/**
 * Attract / implosion (§4a): the inverse of displace. A ring sweeps from the rim to the centre and
 * throws every loose surface cell it passes on an arc that lands on the impact point, so the
 * terrain heaps into a mound there and leaves a hollow around it. Tanks are dragged inward.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.attract',
  version: 1,
  params,
  start(api, p, c) {
    for (const t of api.tanks) {
      if (!t.alive) continue;
      const dx = c.x - t.x;
      const d = Math.abs(dx);
      if (d >= c.radius || d === 0) continue;
      t.x += Math.sign(dx) * Math.min(d, Math.trunc((p.tankPull * d) / c.radius));
    }
    api.emit('implode', c.x, c.y, c.radius, { ticks: p.expandTicks });
    return [c.radius, 0];
  },
  step(api, p, inst) {
    // data: [outer edge of the remaining disc, passes over the core]
    const R = inst.call.radius;
    const r1 = inst.data[0]!;
    const r0 = Math.max(0, r1 - Math.max(1, Math.ceil(R / p.expandTicks)));
    ring(api, p, inst.call, r0, r1);
    inst.data[0] = r0;
    if (r0 > 0) return true;
    // a few extra sweeps so cells uncovered by the first pass follow
    inst.data[0] = R;
    inst.data[1] = inst.data[1]! + 1;
    return inst.data[1]! < 3;
  },
});

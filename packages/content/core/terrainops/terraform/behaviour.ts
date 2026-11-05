import { MaterialRefSchema, z } from '@mudders/shared';
import { defineTerrainOp, type OpCall, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Raise builds up on the surface, lower digs down from it. */
  mode: z.enum(['raise', 'lower']),
  /** Peak height (or depth) at the centre column, in cells. */
  height: z.number().int().min(1).max(400),
  /** Fraction of the half-width at full height before it tapers (1 = flat top, 0 = peak). */
  plateau: z.number().min(0).max(1),
  /** Material a raise builds with. */
  material: MaterialRefSchema,
  /** Rows added or removed per tick while it grows (animated, §4a). */
  rowsPerTick: z.number().int().min(1).max(50),
});
type Params = z.infer<typeof params>;

/** Column height at offset dx from the centre: flat plateau, then a smoothstep taper. */
function profile(p: Params, R: number, dx: number): number {
  const a = Math.abs(dx);
  if (a > R) return 0;
  const flat = Math.round(p.plateau * R);
  if (a <= flat) return p.height;
  const t = Math.floor(((R - a) * 256) / Math.max(1, R - flat));
  const s = (t * t * (768 - 2 * t)) >> 16;
  return Math.round((p.height * s) / 256);
}

function grow(api: SimApi, p: Params, c: OpCall, from: number, to: number): void {
  const g = api.grid;
  const W = g.width;
  const R = c.radius;
  const cell = p.material === 'air' ? 0 : api.mats.cellOf(p.material);
  let minY = g.height;
  for (let x = Math.max(0, c.x - R); x <= Math.min(W - 1, c.x + R); x++) {
    const h = profile(p, R, x - c.x);
    const a = Math.min(h, from);
    const b = Math.min(h, to);
    if (b <= a) continue;
    for (let k = a; k < b; k++) {
      const s = g.surfaceY(x);
      if (p.mode === 'raise') {
        if (s <= 1) break;
        const i = (s - 1) * W + x;
        g.material[i] = cell;
        g.cellState[i] = 0;
        g.fallVel[i] = 0;
        if (s - 1 < minY) minY = s - 1;
      } else {
        if (s >= g.height - 1) break;
        g.clearCell(s * W + x);
        if (s < minY) minY = s;
      }
    }
  }
  if (minY < g.height) g.markDirty(c.x - R, minY, c.x + R, g.height - 1);
  // tanks ride the surface up (a raise never buries them); lowering lets them drop
  if (p.mode === 'raise') {
    for (const t of api.tanks) {
      if (!t.alive || Math.abs(t.x - c.x) > R + 8) continue;
      let y = g.height;
      for (let x = t.x - 8; x < t.x + 8; x++) y = Math.min(y, g.surfaceY(x));
      if (y < t.y) t.y = y;
    }
  }
}

/**
 * Raise / lower (§4a): a column-wise height change over a span with a smooth taper, built a few
 * rows per tick. Raise stacks material on the surface (a wall to hide behind); lower digs a trench.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.terraform',
  version: 1,
  params,
  start(api, p, c) {
    const to = Math.min(p.height, p.rowsPerTick);
    grow(api, p, c, 0, to);
    return to < p.height ? [to] : null;
  },
  step(api, p, inst) {
    const from = inst.data[0]!;
    const to = Math.min(p.height, from + p.rowsPerTick);
    grow(api, p, inst.call, from, to);
    inst.data[0] = to;
    return to < p.height;
  },
});

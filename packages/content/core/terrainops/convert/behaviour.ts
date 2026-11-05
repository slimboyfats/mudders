import { MaterialRefSchema, z } from '@mudders/shared';
import { defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Materials that convert; anything else in the disc is left alone. */
  from: z.array(MaterialRefSchema).min(1),
  into: MaterialRefSchema,
  /** Fraction of the radius that converts fully; beyond it cells convert with falling probability. */
  core: z.number().min(0).max(1),
  /** Ticks to sweep from the centre to the rim (animated, §4a). */
  expandTicks: z.number().int().min(1).max(120),
});
type Params = z.infer<typeof params>;

/** Per-cell hash in [0, 256): ragged edges without consuming match RNG. */
function h8(x: number, y: number): number {
  let h = Math.imul((x * 73856093) ^ (y * 19349663), 0x9e3779b1);
  h ^= h >>> 15;
  return h & 255;
}

function ring(
  api: SimApi,
  p: Params,
  cx: number,
  cy: number,
  R: number,
  r0: number,
  r1: number,
  from: Uint8Array,
  into: number,
): void {
  const g = api.grid;
  const W = g.width;
  const x0 = Math.max(0, cx - r1);
  const x1 = Math.min(W - 1, cx + r1);
  const y0 = Math.max(0, cy - r1);
  const y1 = Math.min(g.height - 1, cy + r1);
  const core = Math.round(p.core * R);
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 < r0 * r0 || d2 >= r1 * r1) continue;
      if (from[g.material[i]!] !== 1) continue;
      if (d2 > core * core) {
        // ragged rim: probability falls linearly from the core to the radius
        const d = Math.sqrt(d2);
        if (h8(x, y) * (R - core) >= 256 * (R - d)) continue;
      }
      g.material[i] = into;
      g.cellState[i] = 0;
      g.fallVel[i] = 0;
      if (into === 0) g.coating[i] = 0;
    }
  }
  g.markDirty(x0, y0, x1, y1);
}

/**
 * Convert (§4a): turn the listed materials inside a disc into another material, sweeping outward
 * over a few ticks. With different parameters this is liquefy (dirt → liquid dirt), harden
 * (dirt → ice) and melt (dirt → lava).
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.convert',
  version: 1,
  params,
  start(api, p, c) {
    const r1 = Math.max(1, Math.ceil(c.radius / p.expandTicks));
    convertRing(api, p, c.x, c.y, c.radius, 0, r1);
    return r1 < c.radius ? [r1] : null;
  },
  step(api, p, inst) {
    const R = inst.call.radius;
    const r0 = inst.data[0]!;
    const r1 = Math.min(R + 1, r0 + Math.max(1, Math.ceil(R / p.expandTicks)));
    convertRing(api, p, inst.call.x, inst.call.y, R, r0, r1);
    inst.data[0] = r1;
    return r1 <= R;
  },
});

function convertRing(
  api: SimApi,
  p: Params,
  cx: number,
  cy: number,
  R: number,
  r0: number,
  r1: number,
): void {
  const from = new Uint8Array(256);
  for (const id of p.from) from[id === 'air' ? 0 : api.mats.cellOf(id)] = 1;
  ring(
    api,
    p,
    cx,
    cy,
    R,
    r0,
    Math.min(r1, R + 1),
    from,
    p.into === 'air' ? 0 : api.mats.cellOf(p.into),
  );
}

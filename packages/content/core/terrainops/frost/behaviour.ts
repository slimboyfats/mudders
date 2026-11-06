import { MaterialRefSchema, z } from '@mudders/shared';
import { defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Soft ground whose exposed skin freezes. */
  skin: z.array(MaterialRefSchema).min(1),
  /** What the skin freezes into. */
  into: MaterialRefSchema,
  /** How far below open air (or one cell beside or under it) the skin reaches. */
  depth: z.number().int().min(1).max(8),
  /** Materials converted anywhere in the disc, whether exposed or not (water → ice, …). */
  deep: z
    .array(z.strictObject({ from: z.array(MaterialRefSchema).min(1), into: MaterialRefSchema }))
    .max(4),
  /** Ticks for the front to race from the centre to the rim. */
  expandTicks: z.number().int().min(1).max(120),
});
type Params = z.infer<typeof params>;

/** Per-cell hash in [0, 256): ragged rim without consuming match RNG. */
function h8(x: number, y: number): number {
  let h = Math.imul((x * 73856093) ^ (y * 19349663), 0x9e3779b1);
  h ^= h >>> 15;
  return h & 255;
}

/** Fully frozen out to this share of the radius (in 1/256); the rim beyond it is ragged. */
const CORE = 180;

/** cell byte → 1 skin, 2+k deep rule k; target per rule. Built per call (256 bytes, cheap). */
function tables(api: SimApi, p: Params): { kind: Uint8Array; into: Uint8Array } {
  const cell = (id: string) => (id === 'air' ? 0 : api.mats.cellOf(id));
  const kind = new Uint8Array(256);
  const into = new Uint8Array(1 + p.deep.length);
  for (const id of p.skin) kind[cell(id)] = 1;
  into[0] = cell(p.into);
  p.deep.forEach((r, k) => {
    for (const id of r.from) kind[cell(id)] = 2 + k;
    into[1 + k] = cell(r.into);
  });
  kind[0] = 0;
  return { kind, into };
}

function ring(api: SimApi, p: Params, cx: number, cy: number, R: number, r0: number, r1: number) {
  const g = api.grid;
  const W = g.width;
  const H = g.height;
  const mat = g.material;
  const { kind, into } = tables(api, p);
  const x0 = Math.max(0, cx - r1);
  const x1 = Math.min(W - 1, cx + r1);
  const y0 = Math.max(0, cy - r1);
  const y1 = Math.min(H - 1, cy + r1);
  const R2 = R * R;
  const core2 = Math.trunc((R2 * CORE * CORE) / 65536);
  const in2 = r0 * r0;
  const out2 = r1 * r1;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
      const k = kind[mat[i]!]!;
      if (k === 0) continue;
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 < in2 || d2 >= out2 || d2 > R2) continue;
      // ragged rim: probability falls off linearly in d² from the core to the radius
      if (d2 > core2 && h8(x, y) * (R2 - core2) >= 256 * (R2 - d2)) continue;
      if (k === 1) {
        let open =
          (x > 0 && mat[i - 1] === 0) ||
          (x < W - 1 && mat[i + 1] === 0) ||
          (y < H - 1 && mat[i + W] === 0);
        for (let a = 1; !open && a <= p.depth && y - a >= 0; a++) open = mat[i - a * W] === 0;
        if (!open) continue;
      }
      const to = into[k - 1]!;
      mat[i] = to;
      g.cellState[i] = 0;
      g.fallVel[i] = 0;
      if (to === 0) g.coating[i] = 0;
    }
  }
  if (x0 <= x1 && y0 <= y1) g.markDirty(x0, y0, x1, y1);
}

/**
 * Flash freeze (§4a): a frost front sweeps from the centre to the rim over `expandTicks` ticks.
 * Soft ground within `depth` cells of open air freezes into `into` (a thin skin, not a block: the
 * hill keeps its shape), and each `deep` rule converts its materials anywhere in the disc.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.frost',
  version: 1,
  params,
  start(api, p, c) {
    const r1 = Math.max(1, Math.ceil(c.radius / p.expandTicks));
    ring(api, p, c.x, c.y, c.radius, 0, r1);
    api.emit('frostFront', c.x, c.y, c.radius, { ticks: p.expandTicks });
    return r1 <= c.radius ? [r1] : null;
  },
  step(api, p, inst) {
    const R = inst.call.radius;
    const r0 = inst.data[0]!;
    const r1 = Math.min(R + 1, r0 + Math.max(1, Math.ceil(R / p.expandTicks)));
    ring(api, p, inst.call.x, inst.call.y, R, r0, r1);
    inst.data[0] = r1;
    return r1 <= R;
  },
});

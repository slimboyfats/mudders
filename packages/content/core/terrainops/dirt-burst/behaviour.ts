import { ContentIdSchema, FP, z } from '@mudders/shared';
import { cosDeci, defineTerrainOp, sinDeci, toFixed, type OpCall, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  material: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** Ticks the burst lasts; each tick throws one shell of the dome. */
  ticks: z.number().int().min(1).max(30),
  /** Cells thrown per tick. */
  rate: z.number().int().min(1).max(2000),
  /** Speed of the slowest and fastest shell, cells/tick. Later shells are slower. */
  minSpeed: z.number().min(0.2).max(10),
  maxSpeed: z.number().min(0.2).max(10),
  /**
   * Throw angles above the horizon, degrees, mirrored to both sides. Leaving out the steep middle
   * splits the dome into two banks with the crater between them.
   */
  lowAngle: z.number().int().min(0).max(90),
  highAngle: z.number().int().min(0).max(90),
  /** Rows above the impact the dome is thrown from, so the crater rim doesn't catch the low throws. */
  lift: z.number().int().min(0).max(32),
});
type Params = z.infer<typeof params>;

const DECI = 10;

/** First air cell from (cx, cy) outward along (dx, dy) fixed-point, up to `max` steps; -1 if none. */
function airAlong(
  api: SimApi,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  r0: number,
  max: number,
): number {
  const g = api.grid;
  const W = g.width;
  for (let r = r0; r < r0 + max; r++) {
    const x = cx + Math.round((dx * r) / FP);
    const y = cy - Math.round((dy * r) / FP);
    if (x < 0 || x >= W || y < 0 || y >= g.height) return -1;
    const i = y * W + x;
    if (g.material[i] === 0) return i;
  }
  return -1;
}

/** Throw one shell of the dome: `rate` cells fanned out both ways. */
function shell(api: SimApi, p: Params, c: OpCall, t: number): void {
  const g = api.grid;
  const rng = api.rng;
  const cell = api.mats.cellOf(p.material);
  const lo = p.lowAngle * DECI;
  const span = Math.max(0, p.highAngle - p.lowAngle) * DECI;
  const vMin = toFixed(p.minSpeed);
  const vMax = toFixed(p.maxSpeed);
  // the first shell is the fastest, so the dome grows from the inside out
  const top = p.ticks <= 1 ? vMax : vMax - Math.trunc(((vMax - vMin) * t) / (p.ticks - 1));
  const bottom = Math.max(vMin, top - Math.trunc((vMax - vMin) / 2));
  let minX = g.width;
  let maxX = -1;
  let minY = g.height;
  let maxY = -1;
  for (let k = 0; k < p.rate; k++) {
    const side = lo + rng.int(span + 1);
    const a = rng.int(2) === 0 ? side : 1800 - side;
    const cs = cosDeci(a);
    const sn = sinDeci(a);
    const i = airAlong(api, c.x, c.y - p.lift, cs, sn, 2 + rng.int(5), 16);
    if (i < 0) continue;
    const s = bottom + rng.int(top - bottom + 1);
    g.material[i] = cell;
    if (!api.launch(i, Math.trunc((cs * s) / FP), -Math.trunc((sn * s) / FP))) {
      g.material[i] = 0;
      break; // debris pool is full
    }
    const x = i % g.width;
    const y = (i - x) / g.width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX >= 0) g.markDirty(minX, minY, maxX, maxY);
}

/**
 * Dirt burst (Dirt Bomb): a dome of dry dirt flung out both ways in a few quick shells, fastest
 * first, from just above the crater so the rim does not catch it. Every cell is sim debris, so the dome rains back down as a wide blanket
 * with banks on both sides, fills craters and buries tanks it lands on.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.dirt-burst',
  version: 1,
  params,
  start(api, p, c) {
    api.emit('dirtBurst', c.x, c.y, c.radius, {
      speed: p.maxSpeed,
      low: p.lowAngle,
      high: p.highAngle,
      lift: p.lift,
    });
    shell(api, p, c, 0);
    return p.ticks > 1 ? [] : null;
  },
  step(api, p, inst) {
    if (inst.t >= p.ticks) return false;
    shell(api, p, inst.call, inst.t);
    return inst.t + 1 < p.ticks;
  },
});

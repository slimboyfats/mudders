import { MaterialRefSchema, z } from '@mudders/shared';
import { defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** What the bridge is built of (a static material with a span, or it just falls down). */
  material: MaterialRefSchema,
  /** Longest deck in columns, from the impact back towards the shooter. */
  length: z.number().int().min(8).max(320),
  /** Shortest deck: dropped at the shooter's feet, it builds this far away from them instead. */
  minLength: z.number().int().min(4).max(120),
  /** Deck thickness in rows. */
  thick: z.number().int().min(2).max(12),
  /** Most rows the deck rises or falls per column, so a tank can always drive it. */
  slope: z.number().int().min(1).max(4),
  /** A pier every `spacing` columns, `pierWidth` wide, if there is ground within `pierDepth` rows. */
  spacing: z.number().int().min(8).max(120),
  pierWidth: z.number().int().min(1).max(12),
  pierDepth: z.number().int().min(4).max(200),
  /** Columns the deck grows per tick. */
  speed: z.number().int().min(1).max(16),
  /** Columns kept clear on the shooter's side of their hull. */
  clear: z.number().int().min(0).max(16),
});
type Params = z.infer<typeof params>;

// data layout: [built, columns, then per column: x, top, deckBottom, pierBottom]
const HEAD = 2;
const COL = 4;

/** First solid row at or below `from` in column x, within `max` rows; -1 if none. */
function groundBelow(api: SimApi, x: number, from: number, max: number): number {
  const g = api.grid;
  const W = g.width;
  const end = Math.min(g.height - 1, from + max);
  for (let y = Math.max(0, from); y <= end; y++) if (g.material[y * W + x] !== 0) return y;
  return -1;
}

/** True if (x, y) is inside a live tank's hitbox: the bridge never grows into a tank. */
function inTank(api: SimApi, x: number, y: number): boolean {
  for (const t of api.tanks) {
    if (!t.alive) continue;
    if (x >= t.x - t.half && x < t.x + t.half && y >= t.y - t.h && y < t.y) return true;
  }
  return false;
}

/** Fill air cells of column x from row y0 to y1 (inclusive) with `cell`. */
function fill(api: SimApi, x: number, y0: number, y1: number, cell: number): void {
  const g = api.grid;
  const W = g.width;
  const a = Math.max(0, y0);
  const b = Math.min(g.height - 1, y1);
  for (let y = a; y <= b; y++) {
    const i = y * W + x;
    if (g.material[i] !== 0 || inTank(api, x, y)) continue;
    g.material[i] = cell;
    g.cellState[i] = 0;
    g.fallVel[i] = 0;
  }
}

/** Build every column up to `upto` that isn't built yet. Returns true while columns remain. */
function build(api: SimApi, d: number[], upto: number, cell: number): boolean {
  const n = d[1]!;
  const from = d[0]!;
  const to = Math.min(n, upto);
  if (to <= from) return from < n;
  let x0 = api.grid.width;
  let x1 = -1;
  let y0 = api.grid.height;
  let y1 = -1;
  let fx = 0;
  let fy = 0;
  for (let k = from; k < to; k++) {
    const b = HEAD + k * COL;
    const x = d[b]!;
    const top = d[b + 1]!;
    const bottom = Math.max(d[b + 2]!, d[b + 3]!);
    fill(api, x, top, bottom, cell);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (top < y0) y0 = top;
    if (bottom > y1) y1 = bottom;
    fx = x;
    fy = top;
  }
  d[0] = to;
  if (x0 <= x1) api.grid.markDirty(x0, y0, x1, y1);
  // the building front for the renderer: dirt kicked up off the newest column
  api.emit('bridgeGrow', fx, fy, 2, { done: to >= n ? 1 : 0 });
  return to < n;
}

/**
 * Earth Bridge: a causeway of rammed earth grows out of the impact back towards the shooter, a
 * straight ramp from the ground where it landed to the ground the shooter stands on. Its slope is
 * capped so a tank can always drive it, so it spans a valley, climbs a cliff, or roofs a gap. Where
 * there is ground under the deck within reach, piers with flared heads hold it up; a long run with
 * nothing beneath it hangs on the material's span and may break off. It never grows into a tank.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.earth-bridge',
  version: 1,
  params,
  start(api, p, c) {
    const g = api.grid;
    const W = g.width;
    const shooter = api.tanks[c.owner];
    const alive = shooter?.alive ?? false;
    // where the deck starts: the ground at the impact (just above it if it hit a wall)
    const ys = groundBelow(api, c.x, Math.max(0, c.y - 4), 40);
    const startTop = ys < 0 ? c.y : ys;
    let dir = alive && shooter!.x < c.x ? -1 : 1;
    let endX: number;
    let endTop: number;
    if (alive && Math.abs(shooter!.x - c.x) - shooter!.half - p.clear >= p.minLength) {
      const s = shooter!;
      endX = s.x - dir * (s.half + p.clear);
      endTop = s.y;
      const dist = Math.abs(endX - c.x);
      if (dist > p.length) {
        endTop = startTop + Math.trunc(((s.y - startTop) * p.length) / dist);
        endX = c.x + dir * p.length;
      }
    } else {
      // too close to build towards them (or nobody to build for): lay it outwards, level
      if (alive) dir = -dir;
      endX = c.x + dir * p.minLength;
      endTop = startTop;
    }
    endX = Math.max(0, Math.min(W - 1, endX));
    const full = Math.abs(endX - c.x) + 1;
    // ride the ground it landed on up to where it drops away: the deck leaves from the edge
    let k0 = 0;
    while (k0 < full - 1) {
      const ground = groundBelow(api, c.x + dir * (k0 + 1), Math.max(0, startTop - 8), 80);
      if (ground < 0 || ground > startTop + 2) break;
      k0++;
    }
    const n = full - k0;
    // never steeper than `slope` rows per column: a tank must be able to drive it
    const rise = Math.max(-p.slope * (n - 1), Math.min(p.slope * (n - 1), endTop - startTop));
    const d: number[] = [0, 0];
    const half = p.pierWidth >> 1;
    for (let k = 0; k < n; k++) {
      const x = c.x + dir * (k0 + k);
      if (x < 0 || x >= W) break;
      const top = startTop + (n > 1 ? Math.trunc((rise * k) / (n - 1)) : 0);
      const deckBottom = top + p.thick - 1;
      // piers: centred every `spacing` columns, away from both ends, with a flared head
      let pierBottom = -1;
      const r = k % p.spacing;
      const dc = Math.min(r, p.spacing - r);
      if (k > half + 2 && k < n - half - 3 && dc <= half + 3) {
        const ground = groundBelow(api, x, deckBottom + 1, p.pierDepth);
        if (ground > deckBottom + 1) {
          pierBottom = dc <= half ? ground - 1 : Math.min(ground - 1, deckBottom + half + 4 - dc);
        }
      }
      d.push(x, top, deckBottom, pierBottom);
      d[1]!++;
    }
    if (d[1] === 0) return null;
    api.emit('earthBridge', c.x + dir * k0, startTop, n, { dir, end: endX });
    const busy = build(api, d, p.speed, api.mats.cellOf(p.material));
    return busy ? d : null;
  },
  step(api, p, inst) {
    return build(api, inst.data, inst.data[0]! + p.speed, api.mats.cellOf(p.material));
  },
});

import { MaterialRefSchema, z } from '@mudders/shared';
import { defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** What the wall is made of. */
  material: MaterialRefSchema,
  /** Free-standing wall: width in cells and height above the impact row. */
  wall: z.strictObject({
    width: z.number().int().min(2).max(24),
    height: z.number().int().min(4).max(120),
  }),
  /**
   * A tank whose hitbox is within `reach` columns (and 24 rows) of the impact is caged instead:
   * a wall on each side, `gap` cells off its hull, `thick` cells thick, and a roof `headroom`
   * cells over its turret if `roof` is on.
   */
  trap: z.strictObject({
    reach: z.number().int().min(0).max(80),
    gap: z.number().int().min(0).max(8),
    thick: z.number().int().min(1).max(12),
    headroom: z.number().int().min(0).max(24),
    roof: z.boolean(),
  }),
  /** Rows (and roof columns) the ice grows per tick. */
  speed: z.number().int().min(1).max(16),
  /** A wall column never reaches further down than this below its top (no endless pillars). */
  maxDepth: z.number().int().min(8).max(200),
});
type Params = z.infer<typeof params>;

/** Per-column hash in [0, 256): a jagged crystal top without consuming match RNG. */
function h8(x: number): number {
  let h = Math.imul(x * 73856093, 0x9e3779b1);
  h ^= h >>> 15;
  return h & 255;
}

// data layout: [progress, columns, then per column: x, top, bottom, delay]
const HEAD = 2;
const COL = 4;

/** First solid row at or below `from` in column x, capped at `from + maxDepth`. */
function floor(api: SimApi, x: number, from: number, maxDepth: number): number {
  const g = api.grid;
  const W = g.width;
  const end = Math.min(g.height - 1, from + maxDepth);
  for (let y = Math.max(0, from); y <= end; y++) if (g.material[y * W + x] !== 0) return y - 1;
  return end;
}

/** Index of the tank to cage, or -1: the nearest live tank within reach (lowest player on ties). */
function caged(api: SimApi, p: Params, cx: number, cy: number): number {
  let best = -1;
  let bestD = 0x7fffffff;
  for (let i = 0; i < api.tanks.length; i++) {
    const t = api.tanks[i]!;
    if (!t.alive) continue;
    const dx = Math.max(0, Math.abs(t.x - cx) - t.half);
    if (dx > p.trap.reach || cy < t.y - t.h - 24 || cy > t.y + 24) continue;
    if (dx < bestD) {
      best = i;
      bestD = dx;
    }
  }
  return best;
}

/** True if (x, y) is inside a live tank's hitbox: the ice grows around tanks, never into them. */
function inTank(api: SimApi, x: number, y: number): boolean {
  for (const t of api.tanks) {
    if (!t.alive) continue;
    if (x >= t.x - t.half && x < t.x + t.half && y >= t.y - t.h && y < t.y) return true;
  }
  return false;
}

/** Fill one more step of every column, bottom up. Returns true while any column still grows. */
function grow(api: SimApi, d: number[], cell: number): boolean {
  const g = api.grid;
  const W = g.width;
  const mat = g.material;
  const prog = d[0]!;
  const n = d[1]!;
  let busy = false;
  let x0 = W;
  let x1 = -1;
  let y0 = g.height;
  let y1 = -1;
  for (let k = 0; k < n; k++) {
    const b = HEAD + k * COL;
    const x = d[b]!;
    const top = d[b + 1]!;
    const bottom = d[b + 2]!;
    const delay = d[b + 3]!;
    const h = prog - delay;
    if (h <= 0) {
      busy = true;
      continue;
    }
    const reach = Math.max(top, bottom - h + 1);
    if (reach > top) busy = true;
    for (let y = bottom; y >= reach; y--) {
      const i = y * W + x;
      if (mat[i] !== 0 || inTank(api, x, y)) continue;
      mat[i] = cell;
      g.cellState[i] = 0;
      g.fallVel[i] = 0;
    }
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (reach < y0) y0 = reach;
    if (bottom > y1) y1 = bottom;
  }
  if (x0 <= x1 && y0 <= y1) g.markDirty(x0, y0, x1, y1);
  return busy;
}

/** Growth front for the renderer: one event spanning the columns still growing, at the top one. */
function front(api: SimApi, d: number[]): void {
  const prog = d[0]!;
  const n = d[1]!;
  let lo = 0x7fffffff;
  let hi = -1;
  let row = 0x7fffffff;
  for (let k = 0; k < n; k++) {
    const b = HEAD + k * COL;
    const h = prog - d[b + 3]!;
    if (h <= 0) continue;
    const at = d[b + 2]! - h + 1;
    if (at < d[b + 1]! - 1) continue;
    const x = d[b]!;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
    if (at < row) row = Math.max(d[b + 1]!, at);
  }
  if (hi >= lo) api.emit('iceGrow', (lo + hi) >> 1, row, ((hi - lo) >> 1) + 1);
}

/**
 * Ice Wall (§4a): a wall of ice grows up out of the ground at the impact, bottom first, with a
 * jagged crystal top. Land it next to a tank and the ice cages it instead: a wall either side of
 * the hull and a roof closing in over the turret from both walls. Ice never grows into a tank.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.ice-wall',
  version: 1,
  params,
  start(api, p, c) {
    const W = api.grid.width;
    const d: number[] = [0, 0];
    const col = (x: number, top: number, bottom: number, delay: number) => {
      if (x < 0 || x >= W || bottom < top) return;
      d.push(x, Math.max(0, top), bottom, delay);
      d[1]!++;
    };
    const who = caged(api, p, c.x, c.y);
    let ex = c.x;
    let ey: number;
    let er = p.wall.height;
    if (who >= 0) {
      const t = api.tanks[who]!;
      const { gap, thick, headroom } = p.trap;
      const roofTop = t.y - t.h - headroom - (p.trap.roof ? thick : 0);
      const lIn = t.x - t.half - gap - 1;
      const rIn = t.x + t.half + gap;
      const lOut = lIn - thick + 1;
      const rOut = rIn + thick - 1;
      // the side walls rise first; the taller one sets when the roof starts
      let rise = 0;
      for (let x = lOut; x <= rOut; x++) {
        if (x > lIn && x < rIn) continue;
        if (x < 0 || x >= W) continue;
        rise = Math.max(rise, floor(api, x, roofTop, p.maxDepth) - roofTop + 1);
      }
      for (let x = lOut; x <= rOut; x++) {
        if (x <= lIn || x >= rIn) {
          if (x < 0 || x >= W) continue;
          const bottom = floor(api, x, roofTop, p.maxDepth);
          col(x, roofTop + (h8(x) & 1), bottom, rise - (bottom - roofTop + 1));
        } else if (p.trap.roof) {
          // the roof closes in from both walls and meets over the turret
          const inward = Math.min(x - lIn, rIn - x);
          col(x, roofTop, roofTop + thick - 1, rise + inward - thick);
        }
      }
      ex = t.x;
      ey = roofTop;
      er = rOut - lOut + 1;
      api.emit('iceCage', t.x, roofTop, er >> 1, { player: t.player });
    } else {
      const top = c.y - p.wall.height;
      const half = p.wall.width >> 1;
      for (let x = c.x - half; x < c.x - half + p.wall.width; x++) {
        if (x < 0 || x >= W) continue;
        const edge = Math.min(x - (c.x - half), c.x - half + p.wall.width - 1 - x);
        // crystal top: lower at the edges, jagged in between
        const t = top + (edge === 0 ? 5 : edge === 1 ? 2 : 0) + (h8(x) % 4);
        col(x, t, floor(api, x, t, p.maxDepth + p.wall.height), 0);
      }
      ey = top;
    }
    api.emit('iceWall', ex, ey, er, { cage: who >= 0 ? 1 : 0 });
    if (d[1] === 0) return null;
    d[0] = p.speed;
    const cell = api.mats.cellOf(p.material);
    const busy = grow(api, d, cell);
    front(api, d);
    return busy ? d : null;
  },
  step(api, p, inst) {
    const d = inst.data;
    d[0]! += p.speed;
    const busy = grow(api, d, api.mats.cellOf(p.material));
    front(api, d);
    return busy;
  },
});

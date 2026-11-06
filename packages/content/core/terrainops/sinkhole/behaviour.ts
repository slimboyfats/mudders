import { z } from '@mudders/shared';
import { SETTLE_STATIC, defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Rows the floor of the pit ends up below where the ground was, at its centre. */
  depth: z.number().int().min(4).max(160),
  /** Random roughness of the floor, in rows (±). */
  rough: z.number().int().min(0).max(16),
  /** Columns over which the pit wall slopes from the rim down to the floor (small = sheer). */
  wall: z.number().int().min(1).max(60),
  /** Rows below the surface where the hidden cavern is: the ground above it drops into it. */
  cavern: z.number().int().min(4).max(160),
  /** Ticks the ground sags slowly (warning rumble) before it gives way. */
  sagTicks: z.number().int().min(0).max(120),
  /** Rows the centre sags during the warning. */
  sagRows: z.number().int().min(0).max(16),
  /** Ticks the plunge takes; the ground speeds up as it falls. */
  plungeTicks: z.number().int().min(1).max(60),
  /** Columns beyond the pit's edge whose ground crumbles in once it has dropped. */
  rim: z.number().int().min(0).max(40),
  /** Rows of rim ground that crumble at the edge (fewer further out). */
  rimRows: z.number().int().min(0).max(40),
  /** Share of rim cells that break loose and tumble into the pit. */
  crumble: z.number().min(0).max(1),
});
type Params = z.infer<typeof params>;

/**
 * Op state, plain integers: [0] ticks since start, [1] left column, [2] right column (inclusive),
 * then per column from left to right: [target drop, applied drop].
 */
const HEAD = 3;

/** Per-cell hash in [0, 256), so the floor and the crumbling rim need no RNG calls per cell. */
function h8(a: number, b: number): number {
  let h = Math.imul((a * 73856093) ^ (b * 19349663), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h & 255;
}

function isFixed(api: SimApi, i: number): boolean {
  const m = api.grid.material[i]!;
  return m !== 0 && (api.mats.settle[m] === SETTLE_STATIC || api.grid.group[i] !== 0);
}

/**
 * Drop the ground of column x between `top` and `top + span` down by `d` rows, into the cavern
 * under it: what was in the cavern's rows is swallowed. Rock and props hold, and so does
 * whatever rests on them.
 */
function dropColumn(api: SimApi, x: number, top: number, span: number, d: number): void {
  const g = api.grid;
  const W = g.width;
  const H = g.height;
  if (d <= 0 || x < 0 || x >= W || top >= H) return;
  let b = Math.min(top + span, H);
  for (let y = top; y < b; y++) {
    if (isFixed(api, y * W + x)) {
      b = y;
      break;
    }
  }
  if (b - top < 1) return;
  const mat = g.material;
  const coat = g.coating;
  const st = g.cellState;
  const fv = g.fallVel;
  for (let y = b - 1; y >= top; y--) {
    const yy = y + d;
    if (yy >= H) continue;
    const t = yy * W + x;
    if (isFixed(api, t)) continue;
    const s = y * W + x;
    mat[t] = mat[s]!;
    coat[t] = coat[s]!;
    st[t] = st[s]!;
    fv[t] = 0;
  }
  for (let y = top; y < Math.min(b, top + d); y++) g.clearCell(y * W + x);
}

/** How far a column should have dropped `t` ticks in: a slow sag, then an accelerating plunge. */
function dropAt(p: Params, target: number, maxTarget: number, t: number): number {
  const sag = maxTarget > 0 ? Math.trunc((p.sagRows * target) / maxTarget) : 0;
  if (t <= p.sagTicks) return p.sagTicks > 0 ? Math.trunc((sag * t) / p.sagTicks) : sag;
  const s = Math.min(p.plungeTicks, t - p.sagTicks);
  const P = p.plungeTicks;
  return sag + Math.trunc(((target - sag) * s * s) / (P * P));
}

/**
 * Sinkhole (§5.1): a cavern opens under the impact. The ground above it sags for a moment with a
 * rumble and dust trickling down the cracks, then gives way all at once: a round pit with sheer
 * walls drops out, carrying anything standing on it to the bottom, and the overhanging rim
 * crumbles in after it. The ground swallowed by the cavern is gone, so the pit stays a pit. Rock
 * and props hold, and so does what rests on them.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.sinkhole',
  version: 1,
  params,
  start(api, p, c) {
    const g = api.grid;
    const W = g.width;
    const R = Math.max(2, c.radius);
    const x0 = Math.max(0, c.x - R);
    const x1 = Math.min(W - 1, c.x + R);
    if (x1 < x0) return null;
    const salt = api.rng.int(1 << 20);
    const inner = Math.max(0, R - p.wall);
    const d: number[] = [0, x0, x1];
    for (let x = x0; x <= x1; x++) {
      const dx = Math.abs(x - c.x);
      let target =
        dx <= inner ? p.depth : Math.trunc((p.depth * (R - dx)) / Math.max(1, R - inner));
      // a rough, rubbly floor: a few rows either way, smoothed over pairs of columns
      if (target > 0 && p.rough > 0) target += (h8(salt, x >> 1) % (2 * p.rough + 1)) - p.rough;
      d.push(Math.max(0, target), 0);
    }
    api.emit('quake', c.x, c.y, R, { strength: 1 });
    return d;
  },
  step(api, p, inst) {
    const g = api.grid;
    const c = inst.call;
    const d = inst.data;
    const t = ++d[0]!;
    const x0 = d[1]!;
    const x1 = d[2]!;
    const R = Math.max(2, c.radius);
    const end = p.sagTicks + p.plungeTicks;
    let minY = g.height;
    if (t <= end) {
      for (let x = x0; x <= x1; x++) {
        const o = HEAD + (x - x0) * 2;
        const target = d[o]!;
        if (target <= 0) continue;
        const want = dropAt(p, target, p.depth + p.rough, t);
        const dy = want - d[o + 1]!;
        if (dy <= 0) continue;
        d[o + 1] = want;
        const top = g.surfaceY(x);
        if (top >= g.height) continue;
        dropColumn(api, x, top, p.cavern, dy);
        if (top < minY) minY = top;
      }
      if (minY < g.height) g.markDirty(x0 - 1, Math.max(0, minY - 1), x1 + 1, g.height - 1);
      if (t < p.sagTicks && t % 8 === 1) {
        api.emit('quake', c.x, g.surfaceY(c.x), R, { strength: 1 });
        api.emit('sinkholeDust', c.x, g.surfaceY(c.x), R, { ticks: 8 });
      }
      if (t === p.sagTicks + 1) api.emit('sinkhole', c.x, g.surfaceY(c.x), R, { depth: p.depth });
      if (t > p.sagTicks && (t - p.sagTicks) % 6 === 1)
        api.emit('quake', c.x, g.surfaceY(c.x), R, { strength: 2 });
      if (t < end) return true;
      // the overhanging rim gives way and tumbles into the pit
      crumble(api, p, c.x, R);
      api.emit('sinkholeDust', c.x, g.surfaceY(c.x), R + p.rim, { ticks: 30, plume: 1 });
      return false;
    }
    return false;
  },
});

/** Knock rim ground loose on both sides so it slides and tumbles over the lip into the pit. */
function crumble(api: SimApi, p: Params, cx: number, R: number): void {
  if (p.rim === 0 || p.rimRows === 0 || p.crumble <= 0) return;
  const g = api.grid;
  const W = g.width;
  const odds = Math.round(p.crumble * 256);
  let minX = W;
  let maxX = -1;
  let minY = g.height;
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; k < p.rim; k++) {
      const x = cx + side * (R + 1 + k) - side * 2;
      if (x < 0 || x >= W) continue;
      const top = g.surfaceY(x);
      if (top >= g.height) continue;
      const rows = Math.trunc((p.rimRows * (p.rim - k)) / p.rim);
      for (let y = top; y < Math.min(g.height, top + rows); y++) {
        const i = y * W + x;
        if (g.material[i] === 0 || isFixed(api, i)) continue;
        if (h8(x * 31 + side, y) >= odds) continue;
        // inward toward the pit, slower the further out it starts
        const vx = -side * ((96 << 10) + (api.rng.int(128) << 10));
        api.launch(i, vx, -(api.rng.int(48) << 10));
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (top < minY) minY = top;
    }
  }
  if (maxX >= minX) g.markDirty(minX - 1, Math.max(0, minY - 1), maxX + 1, g.height - 1);
}

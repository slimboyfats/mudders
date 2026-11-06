import { MaterialRefSchema, z } from '@mudders/shared';
import { SETTLE_STATIC, defineTerrainOp, toFixed, type OpCall, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Fissures on each side of the impact. */
  cracks: z.number().int().min(1).max(8),
  /** Mean columns between neighbouring fissures, and the random spread on it (±). */
  spacing: z.number().int().min(8).max(120),
  jitter: z.number().int().min(0).max(60),
  /** Crack depth in rows next to the impact; the outermost cracks are half as deep. */
  depth: z.number().int().min(4).max(160),
  /** Crack width at the surface; it tapers to one cell at the bottom. */
  width: z.number().int().min(1).max(16),
  /** Largest heave or drop of a slab, in rows; it shrinks with distance from the impact. */
  throw: z.number().int().min(0).max(64),
  /** Ticks a crack takes to rip down to full depth. */
  openTicks: z.number().int().min(1).max(60),
  /** Ticks between one pair of fissures and the next pair further out. */
  stagger: z.number().int().min(0).max(60),
  /** Ticks a slab takes to reach its full heave or drop. */
  shiftTicks: z.number().int().min(1).max(120),
  /** Share of the ground ripped out of a crack that is spewed up as debris (the rest vanishes). */
  spew: z.number().min(0).max(1),
  /** Upward speed of spewed debris from the top of a crack, cells/tick. */
  spewLift: z.number().min(0).max(8),
  /** What fills the bottom of the innermost cracks once they are fully open. */
  floor: MaterialRefSchema,
  floorRows: z.number().int().min(0).max(16),
  /** How many crack pairs, counted from the impact, get the floor material. */
  floorCracks: z.number().int().min(0).max(8),
  /** Ticks after a crack is fully open before the floor pools in it (lets the spew land first). */
  floorDelay: z.number().int().min(0).max(120),
});
type Params = z.infer<typeof params>;

/**
 * Op state, all plain integers (hashed with the world):
 *   [0] ticks since start, [1] fissure count n,
 *   then per fissure (left to right) FIELDS ints: x, surface row when it opened (-1 = not yet),
 *   open tick, depth, width, ring (0 = innermost pair), salt.
 */
const HEAD = 2;
const FIELDS = 7;
const F_X = 0;
const F_TOP = 1;
const F_OPEN = 2;
const F_DEPTH = 3;
const F_WIDTH = 4;
const F_RING = 5;
const F_SALT = 6;

/** Per-cell hash in [0, 256), so a crack's path can be recomputed every tick without the RNG. */
function h8(a: number, b: number): number {
  let h = Math.imul((a * 73856093) ^ (b * 19349663), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h & 255;
}

/** Column offset of a crack's centre `k` rows down: a jagged walk, one step every three rows. */
function wander(salt: number, k: number): number {
  let off = 0;
  for (let j = 3; j <= k; j += 3) {
    const r = h8(salt, j);
    off += r < 80 ? -1 : r >= 176 ? 1 : 0;
  }
  return off;
}

function isFixed(api: SimApi, i: number): boolean {
  const m = api.grid.material[i]!;
  return m !== 0 && (api.mats.settle[m] === SETTLE_STATIC || api.grid.group[i] !== 0);
}

/** Rip crack `f` open from row `k0` (inclusive) to `k1` (exclusive) below where it started. */
function carve(api: SimApi, p: Params, d: number[], f: number, k0: number, k1: number): void {
  const g = api.grid;
  const W = g.width;
  const o = HEAD + f * FIELDS;
  const x0 = d[o + F_X]!;
  const top = d[o + F_TOP]!;
  const depth = d[o + F_DEPTH]!;
  const width = d[o + F_WIDTH]!;
  const salt = d[o + F_SALT]!;
  const spewOdds = Math.round(p.spew * 256);
  const lift = toFixed(p.spewLift);
  let minX = W;
  let maxX = -1;
  let off = wander(salt, k0);
  for (let k = k0; k < k1; k++) {
    if (k > 0 && k % 3 === 0) {
      const r = h8(salt, k);
      off += r < 80 ? -1 : r >= 176 ? 1 : 0;
    }
    const y = top + k;
    if (y >= g.height) break;
    const w = Math.max(1, width - Math.trunc((width * k) / depth));
    const xa = x0 + off - (w >> 1);
    for (let x = xa; x < xa + w; x++) {
      if (x < 0 || x >= W) continue;
      const i = y * W + x;
      if (g.material[i] === 0 || isFixed(api, i)) continue;
      // the upper part of the crack spews its ground up and out; deeper cells just vanish
      if (h8(salt + x, y) < spewOdds) {
        const kick = lift - Math.trunc((lift * k) / (depth + depth));
        // thrown clear to either side, so most of it lands on the lips rather than back in
        const side = api.rng.int(2) === 0 ? -1 : 1;
        const vx = side * ((40 << 10) + (api.rng.int(80) << 10));
        if (api.launch(i, vx, -kick - (api.rng.int(64) << 10))) continue;
      }
      g.clearCell(i);
    }
    if (xa < minX) minX = xa;
    if (xa + w > maxX) maxX = xa + w;
  }
  if (maxX >= minX) g.markDirty(minX - 1, top + k0, maxX + 1, Math.min(g.height - 1, top + k1));
}

/**
 * Pool the floor material (magma) in the bottom of a crack once the spewed ground has come down:
 * every column of the crack mouth whose ground is still deep in the chasm gets a few rows of it.
 */
function floor(api: SimApi, p: Params, d: number[], f: number): void {
  if (p.floorRows === 0 || p.floor === 'air') return;
  const o = HEAD + f * FIELDS;
  if (d[o + F_RING]! >= p.floorCracks) return;
  const g = api.grid;
  const W = g.width;
  const into = api.mats.cellOf(p.floor);
  const top = d[o + F_TOP]!;
  const depth = d[o + F_DEPTH]!;
  const cx = d[o + F_X]! + wander(d[o + F_SALT]!, depth >> 1);
  const w = d[o + F_WIDTH]!;
  let lo = g.height;
  for (let x = cx - w; x <= cx + w; x++) {
    if (x < 0 || x >= W) continue;
    const s = g.surfaceY(x);
    if (s >= g.height || s < top + (depth >> 2)) continue;
    for (let y = Math.max(0, s - p.floorRows); y < s; y++) {
      const i = y * W + x;
      if (g.material[i] !== 0) continue;
      g.material[i] = into;
      g.cellState[i] = 0;
      g.fallVel[i] = 0;
    }
    if (s - p.floorRows < lo) lo = s - p.floorRows;
  }
  if (lo < g.height) g.markDirty(cx - w - 1, Math.max(0, lo - 1), cx + w + 1, top + depth);
}

/**
 * Move the ground of column x between rows `top` and `bottom` (exclusive) up by `dy` rows
 * (down when negative). Rock and props stop the slab: only the ground above them moves.
 */
function shiftColumn(api: SimApi, x: number, top: number, bottom: number, dy: number): void {
  const g = api.grid;
  const W = g.width;
  const H = g.height;
  if (x < 0 || x >= W || dy === 0) return;
  let b = Math.min(bottom, H);
  for (let y = top; y < b; y++) {
    if (isFixed(api, y * W + x)) {
      b = y;
      break;
    }
  }
  if (b - top < 2) return;
  const mat = g.material;
  const coat = g.coating;
  const st = g.cellState;
  const fv = g.fallVel;
  if (dy > 0) {
    const d = Math.min(dy, top);
    if (d <= 0) return;
    for (let y = top; y < b; y++) {
      const s = y * W + x;
      const t = s - d * W;
      mat[t] = mat[s]!;
      coat[t] = coat[s]!;
      st[t] = st[s]!;
      fv[t] = 0;
    }
    // the gap the slab leaves at its foot is filled from below: the ground is pushed up, not torn
    const fill = mat[(b - 1 - d) * W + x]!;
    for (let y = b - d; y < b; y++) {
      const i = y * W + x;
      mat[i] = fill;
      coat[i] = 0;
      st[i] = 0;
      fv[i] = 0;
    }
  } else {
    const d = -dy;
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
}

/** Heave (+) or drop (−) target of column x in the slab between fissures a and b (a < b). */
function slabTarget(p: Params, c: OpCall, d: number[], a: number, x: number): number {
  const oa = HEAD + a * FIELDS;
  const ob = oa + FIELDS;
  const xa = d[oa + F_X]!;
  const xb = d[ob + F_X]!;
  const ring = Math.min(d[oa + F_RING]!, d[ob + F_RING]!);
  const inner = d[oa + F_RING]! > d[ob + F_RING]! ? xb : xa;
  const central = xa < c.x && c.x < xb;
  const mid = (xa + xb) >> 1;
  const dist = Math.abs(mid - c.x);
  const R = Math.max(1, c.radius);
  const mag = Math.trunc((p.throw * Math.max(0, R - dist)) / R);
  if (mag === 0) return 0;
  // the slab under the impact drops (a rift valley); further out the slabs heave and drop in turn
  if (central) return -mag;
  const up = (ring & 1) === 0;
  // tilted: the edge nearer the impact moves the full amount, the far edge a third of it
  const L = Math.max(1, xb - xa);
  const u = Math.abs(x - inner);
  const m = Math.trunc((mag * (3 * L - 2 * u)) / (3 * L));
  return up ? m : -m;
}

/** Applied shift of a slab column `t` ticks after the slab started moving. */
function applied(target: number, t: number, S: number): number {
  if (t <= 0) return 0;
  return t >= S ? target : Math.trunc((target * t) / S);
}

/**
 * Rift (§5.1 Fault Line): fissures rip open outward from the impact in pairs, each a jagged
 * V-shaped crack that spews the ground it splits up into the air. Once two cracks are open, the
 * slab between them moves: the one under the impact drops into a rift valley, the next ones out
 * heave up and drop in turn, tilted like fault blocks, carrying tanks up with them or leaving
 * them at the edge of a fresh cliff. The innermost cracks end in a seam of the floor material
 * (magma). Rock and props hold.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.rift',
  version: 1,
  params,
  start(api, p, c) {
    const g = api.grid;
    const W = g.width;
    const R = Math.max(1, c.radius);
    // fissure positions, innermost pair first; each side wanders on its own
    const left: number[] = [];
    const right: number[] = [];
    for (let side = 0; side < 2; side++) {
      const out = side === 0 ? left : right;
      const dir = side === 0 ? -1 : 1;
      let at = c.x + dir * ((p.spacing >> 1) + api.rng.int(p.jitter + 1) - (p.jitter >> 1));
      for (let r = 0; r < p.cracks; r++) {
        if (Math.abs(at - c.x) > R || at < 2 || at >= W - 2) break;
        out.push(at);
        at += dir * (p.spacing + api.rng.int(2 * p.jitter + 1) - p.jitter);
      }
    }
    const d: number[] = [0, left.length + right.length];
    const push = (x: number, ring: number): void => {
      const dist = Math.abs(x - c.x);
      const depth = Math.max(4, Math.trunc((p.depth * (2 * R - dist)) / (2 * R)));
      const width = Math.max(1, Math.trunc((p.width * (2 * R - dist)) / (2 * R)));
      d.push(x, -1, 1 + ring * p.stagger, depth, width, ring, api.rng.int(1 << 20));
    };
    for (let r = left.length - 1; r >= 0; r--) push(left[r]!, r);
    for (let r = 0; r < right.length; r++) push(right[r]!, r);
    api.emit('quake', c.x, c.y, c.radius, { strength: 3 });
    return d[1]! > 0 ? d : null;
  },
  step(api, p, inst) {
    const g = api.grid;
    const c = inst.call;
    const d = inst.data;
    const t = ++d[0]!;
    const n = d[1]!;
    let busy = false;
    // cracks
    for (let f = 0; f < n; f++) {
      const o = HEAD + f * FIELDS;
      const open = d[o + F_OPEN]!;
      const depth = d[o + F_DEPTH]!;
      if (t < open) {
        busy = true;
        continue;
      }
      if (t === open) {
        d[o + F_TOP] = g.surfaceY(d[o + F_X]!);
        api.emit('rift', d[o + F_X]!, d[o + F_TOP]!, depth, {
          width: d[o + F_WIDTH]!,
          hot: d[o + F_RING]! < p.floorCracks ? 1 : 0,
        });
      }
      if (d[o + F_TOP]! >= g.height) continue;
      const k0 = Math.trunc((depth * (t - open)) / p.openTicks);
      const k1 = Math.min(depth, Math.trunc((depth * (t - open + 1)) / p.openTicks));
      if (k1 > k0) carve(api, p, d, f, k0, k1);
      const settled = open + p.openTicks + p.floorDelay;
      if (t === settled) floor(api, p, d, f);
      if (t < settled) busy = true;
    }
    // slabs between neighbouring cracks
    let minY = g.height;
    let minX = g.width;
    let maxX = -1;
    for (let a = 0; a + 1 < n; a++) {
      const oa = HEAD + a * FIELDS;
      const ob = oa + FIELDS;
      const begin = Math.max(d[oa + F_OPEN]!, d[ob + F_OPEN]!) + (p.openTicks >> 1);
      const s = t - begin;
      if (s <= 0) {
        busy = true;
        continue;
      }
      if (s > p.shiftTicks) continue;
      busy = true;
      const xa = d[oa + F_X]!;
      const xb = d[ob + F_X]!;
      const depth = Math.min(d[oa + F_DEPTH]!, d[ob + F_DEPTH]!);
      // the slab spans the ground between the two crack mouths
      const from = xa + (d[oa + F_WIDTH]! >> 1) + 1;
      const to = xb - (d[ob + F_WIDTH]! >> 1) - 1;
      for (let x = from; x <= to; x++) {
        const target = slabTarget(p, c, d, a, x);
        const dy = applied(target, s, p.shiftTicks) - applied(target, s - 1, p.shiftTicks);
        if (dy === 0) continue;
        const top = g.surfaceY(x);
        if (top >= g.height) continue;
        shiftColumn(api, x, top, top + depth, dy);
        if (top - Math.max(0, dy) < minY) minY = top - Math.max(0, dy);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        // a tank standing on a heaving slab rides up with it (a dropping one just falls)
        if (dy > 0) {
          for (const tk of api.tanks) {
            if (tk.alive && tk.x === x && tk.y >= top - 2 && tk.y <= top + 2)
              tk.y = Math.max(1, tk.y - dy);
          }
        }
      }
      if ((s & 3) === 1) {
        const mid = (xa + xb) >> 1;
        api.emit('quake', mid, g.surfaceY(mid), (xb - xa) >> 1, { strength: 2 });
      }
    }
    if (maxX >= minX) g.markDirty(minX - 1, Math.max(0, minY - 1), maxX + 1, g.height - 1);
    return busy;
  },
});

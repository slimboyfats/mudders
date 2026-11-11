import { FP, z } from '@mudders/shared';
import {
  NUM_DAMAGE_TYPES,
  SETTLE_STATIC,
  defineTerrainOp,
  floodCohesive,
  isqrt,
  toFixed,
  type OpCall,
  type SimApi,
  type TankHandle,
} from '@mudders/sim';

const params = z.strictObject({
  /** Launch speed at the centre in cells/tick; falls off linearly to 0 at the radius. */
  speed: z.number().min(0.1).max(32),
  /** Upward kick as a fraction of the launch speed, so buried cells heave up and out. */
  lift: z.number().min(0).max(2),
  /** Cells slower than this stay put. */
  minSpeed: z.number().min(0),
  /** Ticks for the ring to reach the full radius. */
  expandTicks: z.number().int().min(1).max(120),
  /** Distance a cohesive blob is shoved at the centre, in cells. */
  blobPush: z.number().int().min(0).max(200),
  /** Largest cohesive body moved as one blob; bigger bodies hold. */
  maxBlob: z.number().int().min(16).max(1_000_000),
  /**
   * Tank throw: when the ring front reaches a tank it is flung away from the centre in an arc
   * this many cells long (right at the centre; falls off linearly to 0 at the edge). 0 = off.
   */
  fling: z.number().int().min(0).max(800).default(0),
  /** Height of that arc right at the centre, cells (scaled down the same way, at least 4). */
  flingApex: z.number().int().min(0).max(200).default(40),
  /** Throws shorter than this many cells are skipped. */
  flingMin: z.number().int().min(0).max(200).default(6),
  /**
   * Most cells of fall a landing counts for fall damage right at the centre (like the Bumper's
   * `landFall`), scaled down like the throw: a tank at the edge of the ring lands softly.
   */
  landFall: z.number().int().min(0).max(200).default(30),
  /** Slams into walls and bounces off the map edges before a thrown tank just drops; speed kept per edge bounce %. */
  bounces: z.number().int().min(0).max(12).default(2),
  restitution: z.number().int().min(10).max(100).default(55),
  /** Under an open parachute: fall speed (cells/tick) and sideways speed kept per tick, %. */
  chuteFall: z.number().min(0.1).max(4).default(0.8),
  chuteDrag: z.number().int().min(50).max(100).default(96),
  /**
   * A thrown tank that slams into a hillside or a wall takes this many HP per cell/tick of the
   * sideways speed it hit with (credited to the shooter). 0 = off.
   */
  slamDamage: z.number().min(0).max(40).default(0),
  /** Launch speed of prop cells (houses, trees, towers) as % of loose terrain's: they blow apart. */
  propBoost: z.number().int().min(0).max(1000).default(100),
});
type Params = z.infer<typeof params>;

/** Strength floor so a near-zero resistance can't produce an unbounded push. */
const MIN_STRENGTH = 32;

/**
 * Shockwave displacement (§4a). A ring expands over `expandTicks`; each tick every loose (non-
 * static) cell in the new annulus is knocked loose as sim debris with an outward radial velocity
 * of `speed × (1 − d/R) / strength[damageType]` plus an upward `lift`. The whole band goes airborne
 * at once, flies a short arc and lands as terrain against the material just outside it, which the
 * next annulus then launches again: the dirt is bulldozed outward and piles up as a rim where the
 * speed runs out. Nothing is destroyed (debris that leaves the map sideways is the only loss).
 * Cohesive cells (material or coating cohesion > 0) are instead flood-filled and shoved as one blob
 * (§4b).
 */
function ring(api: SimApi, p: Params, c: OpCall, r0: number, r1: number): void {
  const { grid, mats, scratch } = api;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const coat = grid.coating;
  const kind = mats.settle;
  const str = mats.strength;
  const coh = mats.cohesion;
  const moved = scratch.moved;
  const gen = scratch.nextMovedGen();
  const R = c.radius;
  const cx = c.x;
  const cy = c.y;
  const r0s = r0 * r0;
  const r1s = r1 * r1;
  const dt = c.damageTypeIndex;
  const speedFp = p.speed * FP;
  const minFp = p.minSpeed * FP;

  for (let y = Math.max(0, cy - r1); y <= Math.min(H - 1, cy + r1); y++) {
    const dy = y - cy;
    for (let hh = 0; hh < 2; hh++) {
      const xs = hh === 0 ? 1 : -1;
      for (let x = hh === 0 ? cx - r1 : cx + r1; hh === 0 ? x < cx : x >= cx; x += xs) {
        if (x < 0 || x >= W) continue;
        const dx = x - cx;
        const d2 = dx * dx + dy * dy;
        if (d2 < r0s || d2 >= r1s) continue;
        const idx = y * W + x;
        const m = mat[idx]!;
        // static cells hold, unless they belong to a prop group: those take the hit (§4c)
        const inGroup = grid.group[idx] !== 0;
        if (m === 0 || moved[idx] === gen || (kind[m] === SETTLE_STATIC && !inGroup)) continue;
        const dist = Math.max(1, Math.sqrt(d2));
        const s = Math.max(MIN_STRENGTH, str[m * NUM_DAMAGE_TYPES + dt]!);
        let v = (speedFp * (R - dist) * 256) / (R * s);
        if (inGroup) v = (v * p.propBoost) / 100;
        if (v < minFp) continue;
        if (!inGroup && (coh[m]! > 0 || coh[coat[idx]!]! > 0)) {
          const push = Math.trunc((p.blobPush * (R - dist) * 256) / (R * s));
          if (push > 0) moveBlob(api, p, idx, cx, cy, R, push, gen);
          continue;
        }
        const ux = d2 === 0 ? 0 : dx / dist;
        const uy = d2 === 0 ? -1 : dy / dist;
        api.launch(idx, Math.trunc(ux * v), Math.trunc((uy - p.lift) * v));
      }
    }
  }
  grid.markDirty(cx - r1, cy - r1, cx + r1, cy + r1);
}

function moveBlob(
  api: SimApi,
  p: Params,
  start: number,
  cx: number,
  cy: number,
  R: number,
  push: number,
  gen: number,
): void {
  const { grid, mats, scratch } = api;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const coat = grid.coating;
  const state = grid.cellState;
  const q = scratch.queue;
  const mark = scratch.mark;
  const moved = scratch.moved;
  const fg = scratch.nextMarkGen();
  const n = floodCohesive(grid, mats, scratch, start, cx, cy, R, fg, p.maxBlob);
  if (n < 0) {
    moved[start] = gen;
    return;
  }
  let sx = 0;
  let sy = 0;
  let minX = W;
  let maxX = 0;
  let minY = H;
  let maxY = 0;
  for (let i = 0; i < n; i++) {
    const j = q[i]!;
    const x = j % W;
    const y = (j - x) / W;
    sx += x;
    sy += y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const dx = sx / n - cx;
  let dy = sy / n - cy;
  if (dx === 0 && dy === 0) dy = -1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  let bx = Math.round((dx * push) / dist);
  let by = Math.round((dy * push) / dist);

  while (bx !== 0 || by !== 0) {
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const j = q[i]!;
      const x = (j % W) + bx;
      const y = Math.floor(j / W) + by;
      if (x < 0 || y < 0 || x >= W || y >= H) ok = false;
      else {
        const t = y * W + x;
        if (mat[t] !== 0 && mark[t] !== fg) ok = false;
      }
    }
    if (ok) break;
    bx = Math.trunc(bx / 2);
    by = Math.trunc(by / 2);
  }
  if (bx === 0 && by === 0) {
    for (let i = 0; i < n; i++) moved[q[i]!] = gen;
    return;
  }
  const off = by * W + bx;
  const tm = scratch.tmpMat;
  const tc = scratch.tmpCoat;
  const ts = scratch.tmpState;
  for (let i = 0; i < n; i++) {
    const j = q[i]!;
    tm[i] = mat[j]!;
    tc[i] = coat[j]!;
    ts[i] = state[j]!;
    mat[j] = 0;
    coat[j] = 0;
    state[j] = 0;
    grid.fallVel[j] = 0;
  }
  for (let i = 0; i < n; i++) {
    const t = q[i]! + off;
    mat[t] = tm[i]!;
    coat[t] = tc[i]!;
    state[t] = ts[i]!;
    moved[t] = gen;
  }
  grid.markDirty(
    Math.min(minX, minX + bx),
    Math.min(minY, minY + by),
    Math.max(maxX, maxX + bx),
    Math.max(maxY, maxY + by),
  );
}

function ringEdge(R: number, k: number, ticks: number): number {
  return Math.min(R, Math.floor((R * (k + 1) + ticks - 1) / ticks));
}

// data: [r0, ...per tank: state, x (fixed), y (fixed), vx, vy, bounces, held x, held y, landFall]
const TANKS = 1;
const SLOT = 9;
const WAIT = 1;
const FLY = 2;
const DONE = 3;
/** Cells a thrown tank rides up over a lip of dirt instead of slamming into it. */
const CLIMB = 6;

/** Is any of a tank's body (bottom row `y`-1 and its middle row) in the ground at column x? */
function blocked(api: SimApi, t: TankHandle, x: number, y: number): boolean {
  const g = api.grid;
  for (let k = 0; k < 2; k++) {
    const row = k === 0 ? y - 1 : y - (t.h >> 1);
    if (row < 0) continue;
    if (row >= g.height) return true;
    for (let xx = x - t.half; xx < x + t.half; xx++) {
      if (xx < 0 || xx >= g.width) return true;
      if (g.material[row * g.width + xx] !== 0) return true;
    }
  }
  return false;
}

/** Is there ground under the tank's tracks (row `y`) anywhere across its hull? */
function footing(api: SimApi, t: TankHandle, x: number, y: number): boolean {
  const g = api.grid;
  if (y >= g.height) return false;
  for (let xx = Math.max(0, x - t.half); xx < Math.min(g.width, x + t.half); xx++) {
    if (g.material[y * g.width + xx] !== 0) return true;
  }
  return false;
}

/** Throw the tanks the ring front (now at radius r1) has reached. */
function reachTanks(
  api: SimApi,
  p: Params,
  c: OpCall,
  d: number[],
  r1: number,
  last: boolean,
): void {
  for (const t of api.tanks) {
    const b = TANKS + t.player * SLOT;
    if (b + SLOT > d.length || d[b] !== WAIT) continue;
    if (!t.alive) {
      d[b] = DONE;
      continue;
    }
    const dx = t.x - c.x;
    const dy = t.y - (t.h >> 1) - c.y;
    const dist = isqrt(dx * dx + dy * dy);
    const reach = c.radius + t.half;
    if (dist >= reach) {
      if (last) d[b] = DONE;
      continue;
    }
    if (dist > r1 + t.half && !last) continue;
    d[b] = DONE;
    const k = reach - dist;
    const range = Math.trunc((p.fling * k) / reach);
    if (range < p.flingMin) continue;
    const apex = Math.max(4, Math.trunc((p.flingApex * k) / reach));
    const vy0 = isqrt(2 * api.gravity * apex * FP);
    const air = Math.max(1, Math.trunc((2 * vy0) / Math.max(1, api.gravity)));
    const owner = api.tanks[c.owner];
    const dir = dx > 0 ? 1 : dx < 0 ? -1 : owner && owner.x > c.x ? -1 : 1;
    d[b] = FLY;
    d[b + 1] = t.x * FP + FP / 2;
    d[b + 2] = t.y * FP;
    d[b + 3] = Math.trunc((dir * range * FP) / air);
    d[b + 4] = -vy0;
    d[b + 5] = 0;
    d[b + 6] = t.x;
    d[b + 7] = t.y;
    d[b + 8] = Math.trunc((p.landFall * k) / reach);
    api.emit('shockFling', t.x, t.y - (t.h >> 1), t.half, { player: t.player, dir });
  }
}

/** One tick of a thrown tank's flight. Returns true while it is still in the air. */
function fly(
  api: SimApi,
  p: Params,
  t: TankHandle,
  d: number[],
  b: number,
  owner: number,
): boolean {
  // another blast (or the kernel) moved it since our last tick: it's theirs now
  if (t.x !== d[b + 6] || t.y !== d[b + 7]) return false;
  const g = api.grid;
  let x = d[b + 1]!;
  let y = d[b + 2]!;
  let vx = d[b + 3]!;
  let vy = d[b + 4]! + api.gravity;
  if (t.chute) {
    vy = Math.min(vy, toFixed(p.chuteFall));
    vx = Math.trunc((vx * p.chuteDrag) / 100);
  }
  let bounces = d[b + 5]!;
  const fast = Math.max(Math.abs(vx), Math.abs(vy));
  const steps = Math.max(1, Math.ceil(fast / FP));
  let flying = true;
  let landed = false;
  for (let s = 0; s < steps && flying; s++) {
    let nx = x + Math.trunc(vx / steps);
    let ny = y + Math.trunc(vy / steps);
    let cx = Math.floor(nx / FP);
    let cy = Math.floor(ny / FP);
    if (cx < t.half || cx > g.width - 1 - t.half) {
      vx = -Math.trunc((vx * p.restitution) / 100);
      bounces++;
      nx = x;
      cx = Math.floor(nx / FP);
    }
    if (cy >= g.height) {
      flying = false;
      break;
    }
    if (cy < t.h) {
      ny = t.h * FP;
      cy = t.h;
      if (vy < 0) vy = 0;
    }
    if (blocked(api, t, cx, cy)) {
      const ox = Math.floor(x / FP);
      const oy = Math.floor(y / FP);
      if (!blocked(api, t, ox, cy)) {
        // a lip of thrown dirt or a low step: ride up over it with the blast
        let up = 1;
        while (up <= CLIMB && blocked(api, t, cx, cy - up)) up++;
        if (up <= CLIMB) {
          ny = (cy - up) * FP;
        } else {
          // slammed into a hillside or a wall: it stops dead there and drops
          const hit = Math.trunc((Math.abs(vx) * p.slamDamage) / FP);
          vx = 0;
          bounces++;
          api.emit('shockSlam', ox, oy - (t.h >> 1), t.half, { player: t.player, damage: hit });
          if (hit > 0) api.hurt(t.player, hit, owner);
          nx = x;
        }
      } else if (vy < 0 && !blocked(api, t, cx, oy)) {
        vy = 0;
        ny = y;
      } else {
        flying = false;
        break;
      }
    } else if (vy > 0 && footing(api, t, cx, cy)) {
      x = nx;
      y = cy * FP;
      flying = false;
      landed = true;
      break;
    }
    x = nx;
    y = ny;
    if (bounces > p.bounces) flying = false;
  }
  d[b + 1] = x;
  d[b + 2] = y;
  d[b + 3] = vx;
  d[b + 4] = vy;
  d[b + 5] = bounces;
  const hx = Math.floor(x / FP);
  const hy = Math.floor(y / FP);
  if (landed) api.hold(t.player, hx, hy, hy - d[b + 8]!);
  else api.hold(t.player, hx, hy);
  d[b + 6] = t.x;
  d[b + 7] = t.y;
  if (flying) api.emit('shockFly', hx, hy - (t.h >> 1), t.half, { player: t.player });
  return flying;
}

/** Step every thrown tank; true while any is still in the air. */
function flyTanks(api: SimApi, p: Params, d: number[], owner: number): boolean {
  let busy = false;
  for (const t of api.tanks) {
    const b = TANKS + t.player * SLOT;
    if (b + SLOT > d.length || d[b] !== FLY) continue;
    if (t.alive && fly(api, p, t, d, b, owner)) busy = true;
    else d[b] = DONE;
  }
  return busy;
}

/**
 * Shockwave displacement (§4a), see `ring`. With `fling` on, the ring front also throws every
 * tank it reaches (shooter included: it's a blast wave) in an arc away from the centre, longer
 * and higher the closer it stood. A thrown tank bounces off walls and the map edges and lands as
 * a normal fall (counted over at most `landFall` cells; shields and parachutes work as usual);
 * slamming into a hillside on the way hurts by `slamDamage` per cell/tick of speed.
 * Prop cells (houses, trees) fly `propBoost`% as fast as loose dirt, so buildings blow apart.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.displace',
  version: 4,
  params,
  start(api, p, c) {
    const r1 = ringEdge(c.radius, 0, p.expandTicks);
    ring(api, p, c, 0, r1);
    api.emit('shockwave', c.x, c.y, c.radius, { ticks: p.expandTicks });
    if (p.fling === 0) return r1 < c.radius ? [r1] : null;
    const data = [r1];
    for (const t of api.tanks) data.push(t.alive ? WAIT : DONE, 0, 0, 0, 0, 0, 0, 0, 0);
    reachTanks(api, p, c, data, r1, r1 >= c.radius);
    return data;
  },
  step(api, p, inst) {
    const d = inst.data;
    const c = inst.call;
    const r0 = d[0]!;
    const growing = r0 < c.radius;
    if (growing) {
      const r1 = ringEdge(c.radius, inst.t, p.expandTicks);
      ring(api, p, c, r0, r1);
      d[0] = r1;
      if (p.fling > 0) reachTanks(api, p, c, d, r1, r1 >= c.radius);
    }
    const flying = p.fling > 0 && flyTanks(api, p, d, c.owner);
    return d[0]! < c.radius || flying;
  },
});

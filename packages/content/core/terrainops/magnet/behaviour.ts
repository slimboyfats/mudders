import { FP, z } from '@mudders/shared';
import { defineTerrainOp, type OpCall, type SimApi, type TankHandle } from '@mudders/sim';

const params = z.strictObject({
  /** Ticks after landing before the field switches on (the mine beds in and blinks). */
  arm: z.number().int().min(0).max(120),
  /** Ticks the field runs once on; the mine's core is timed to go off right after. */
  life: z.number().int().min(10).max(600),
  /** Ticks the field takes to build up to full strength once on. */
  rise: z.number().int().min(1).max(120),
  /** Pull on a tank at the mine (cells/tick²); it falls off linearly to a quarter at the rim. */
  pull: z.number().min(0).max(0.5),
  /** Fastest a tank is dragged along the ground, cells/tick. */
  maxSpeed: z.number().min(0).max(4),
  /** Highest step (cells) a dragged tank is hauled up; a taller wall stops it. */
  climb: z.number().int().min(0).max(16),
  /** Gap (cells) between a tank's side and the mine at which it clamps on and stops. */
  stick: z.number().int().min(0).max(16),
  /** Materials the magnet tears out of the ground and drags in. */
  metals: z.array(z.string()).max(8),
  /** Columns sampled per tick for exposed metal, and how deep under the surface it reaches. */
  rip: z.number().int().min(0).max(64),
  ripDepth: z.number().int().min(0).max(40),
  /** Speed a torn-out metal cell jumps out of the ground with, cells/tick. */
  pop: z.number().min(0).max(4),
  /** Pull on metal debris already in the air, cells/tick². */
  debrisPull: z.number().min(0).max(1),
});
type Params = z.infer<typeof params>;

// data: [age, ...per tank: x (fixed), vx (fixed), state]
const AGE = 0;
const TANKS = 1;
const SLOT = 3;
const FREE = 0;
const STUCK = 1;
/** Fixed-point strength scale. */
const S1 = 256;

/** 0..S1: how strong the field is at `age`. Zero while arming and once it has run out. */
function strength(p: Params, age: number): number {
  const on = age - p.arm;
  if (on < 0 || on >= p.life) return 0;
  return on >= p.rise ? S1 : Math.trunc(((on + 1) * S1) / p.rise);
}

/** Integer hash for per-sample variety (not the match RNG, so other rolls never shift). */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Is the tank's whole body (rows y-h..y-1 over its width) clear of ground at column x? */
function clear(api: SimApi, t: TankHandle, x: number, y: number): boolean {
  const g = api.grid;
  if (x - t.half < 0 || x + t.half > g.width) return false;
  for (let row = y - t.h; row < y; row++) {
    if (row < 0) continue;
    if (row >= g.height) return false;
    const base = row * g.width;
    for (let xx = x - t.half; xx < x + t.half; xx++) if (g.material[base + xx] !== 0) return false;
  }
  return true;
}

/**
 * Drag tanks along the ground toward the mine: they skid over bumps, are hauled up small steps,
 * drop off ledges (the kernel's fall rules apply) and clamp on when they reach it.
 */
function dragTanks(api: SimApi, p: Params, c: OpCall, d: number[], s: number): void {
  const R = c.radius;
  const accel0 = Math.trunc((p.pull * FP * s) / S1);
  const vmax = Math.trunc(p.maxSpeed * FP);
  for (const t of api.tanks) {
    const b = TANKS + t.player * SLOT;
    if (b + SLOT > d.length || !t.alive || d[b + 2] === STUCK) continue;
    const dx = c.x - t.x;
    const dy = c.y - t.y;
    const adx = dx < 0 ? -dx : dx;
    if (adx * adx + dy * dy >= R * R) continue;
    const dir = dx < 0 ? -1 : 1;
    const gap = t.half + p.stick;
    if (adx <= gap) {
      d[b + 2] = STUCK;
      d[b + 1] = 0;
      api.emit('magnetClank', t.x, t.y - (t.h >> 1), t.half, { player: t.player });
      continue;
    }
    // the kernel may have moved it (a slide or a fall): resync the sub-cell position
    let fx = d[b]!;
    if (Math.floor(fx / FP) !== t.x) fx = t.x * FP + (FP >> 1);
    const a = accel0 - Math.trunc((((accel0 * 3) >> 2) * adx) / R);
    let v = d[b + 1]! + dir * a;
    if (v > vmax) v = vmax;
    if (v < -vmax) v = -vmax;
    // never overshoot the clamp point
    const stop = (c.x - dir * gap) * FP + (FP >> 1);
    let nfx = fx + v;
    if ((dir > 0 && nfx > stop) || (dir < 0 && nfx < stop)) nfx = stop;
    const target = Math.floor(nfx / FP);
    let x = t.x;
    let y = t.y;
    let blocked = false;
    while (x !== target && !blocked) {
      const nx = x + dir;
      let k = 0;
      while (k <= p.climb && !clear(api, t, nx, y - k)) k++;
      if (k > p.climb) blocked = true;
      else {
        x = nx;
        y -= k;
      }
    }
    if (blocked) {
      // up against a wall it can't be hauled over: it strains there
      v = 0;
      nfx = x * FP + (FP >> 1);
    }
    if (x !== t.x || y !== t.y) {
      t.x = x;
      t.y = y;
    }
    d[b] = nfx;
    d[b + 1] = v;
  }
}

/** Tear exposed metal out of the ground near the surface and throw it at the mine. */
function ripMetal(api: SimApi, p: Params, c: OpCall, metal: number[], age: number, s: number) {
  const n = Math.trunc((p.rip * s) / S1);
  if (n <= 0 || p.metals.length === 0) return;
  const g = api.grid;
  const W = g.width;
  const R = c.radius;
  const pop = Math.trunc(p.pop * FP);
  let x0 = W;
  let x1 = -1;
  let y0 = g.height;
  let y1 = -1;
  for (let k = 0; k < n; k++) {
    const r = hash(age, k);
    const x = c.x + ((r % (2 * R + 1)) - R);
    if (x === c.x) continue;
    if (x < 0 || x >= W) continue;
    const sy = g.surfaceY(x);
    for (let y = sy; y < Math.min(g.height, sy + p.ripDepth); y++) {
      const i = y * W + x;
      if (!isMetal(metal, g.material[i]!)) continue;
      if (y > 0 && g.material[i - W] !== 0 && !isMetal(metal, g.material[i - W]!)) break;
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy >= R * R) break;
      // it jumps out of the ground toward the mine; the pull in the air does the rest
      if (api.launch(i, dx < 0 ? pop >> 1 : -(pop >> 1), -pop)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      break;
    }
  }
  if (x1 >= 0) g.markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
}

/** Bend metal debris already in the air toward the mine. */
function pullDebris(api: SimApi, p: Params, c: OpCall, metal: number[], s: number): void {
  const k = Math.trunc((p.debrisPull * FP * s) / S1);
  if (k <= 0) return;
  const db = api.debris;
  const R = c.radius * FP;
  const cx = c.x * FP + (FP >> 1);
  const cy = (c.y - 2) * FP;
  const near = 3 * FP;
  for (let i = 0; i < db.count; i++) {
    if (!isMetal(metal, db.mat[i]!)) continue;
    const dx = cx - db.x[i]!;
    const dy = cy - db.y[i]!;
    if (dx > R || dx < -R || dy > R || dy < -R) continue;
    // right on the mine it lets go and drops, so the metal heaps up round it
    if (dx < near && dx > -near && dy < near && dy > -near) continue;
    // damped, gravity-free pull: a metal chip homes in on the mine instead of orbiting it
    db.vx[i] = db.vx[i]! - (db.vx[i]! >> 3) + (dx > 0 ? k : dx < 0 ? -k : 0);
    db.vy[i] = db.vy[i]! - (db.vy[i]! >> 3) - api.gravity + (dy > 0 ? k : dy < 0 ? -k : 0);
  }
}

/** Cell bytes of the magnetic materials, as a bit set over the low 256 cells. */
function metalTable(api: SimApi, p: Params): number[] {
  const m = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const id of p.metals) {
    const c = api.mats.cellOf(id);
    m[c >> 5] = m[c >> 5]! | (1 << (c & 31));
  }
  return m;
}

function isMetal(m: number[], cell: number): boolean {
  return cell !== 0 && (m[cell >> 5]! & (1 << (cell & 31))) !== 0;
}

/**
 * Magnet (weapon.magnet-mine): the mine beds in where it lands, then switches on a magnetic field.
 * Tanks in range are dragged along the ground toward it (faster the closer they get), hauled up
 * small steps and over bumps, and clamp on when they reach it; a wall too tall to climb holds them
 * back. Exposed metal in the ground (meteorite, slag) is torn out and flies at the mine, and metal
 * debris already in the air bends toward it. The weapon's core goes off when the field runs out.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.magnet',
  version: 1,
  params,
  start(api) {
    const data = [0];
    for (let i = 0; i < api.tanks.length; i++) data.push(0, 0, FREE);
    return data;
  },
  step(api, p, inst) {
    const d = inst.data;
    const c = inst.call;
    const age = d[AGE]!;
    const s = strength(p, age);
    const on = age - p.arm;
    api.emit('magnet', c.x, c.y, c.radius, {
      age,
      arm: p.arm,
      life: p.life,
      strength: Math.trunc((s * 100) / S1),
    });
    if (on === 0) api.emit('magnetOn', c.x, c.y, c.radius);
    if (s > 0) {
      dragTanks(api, p, c, d, s);
      const metal = metalTable(api, p);
      ripMetal(api, p, c, metal, age, s);
      pullDebris(api, p, c, metal, s);
    }
    d[AGE] = age + 1;
    return on + 1 < p.life;
  },
});

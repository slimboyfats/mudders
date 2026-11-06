import { z } from '@mudders/shared';
import {
  FP,
  SETTLE_STATIC,
  TANK_H,
  TANK_HALF,
  defineTerrainOp,
  sinDeci,
  cosDeci,
  toFixed,
  type OpCall,
  type OpInstance,
  type SimApi,
} from '@mudders/sim';

const params = z.strictObject({
  /** Whole life in ticks, touchdown and rope-out included. */
  life: z.number().int().min(60).max(900),
  /** Ticks the funnel takes to come down out of the cloud before it touches the ground. */
  touchdown: z.number().int().min(1).max(120),
  /** Ticks it spends thinning out to a rope at the end. */
  ropeOut: z.number().int().min(1).max(120),
  /** Funnel height above the ground, in cells. */
  height: z.number().int().min(20).max(240),
  /** Half-width of the funnel at the ground and at the top, in cells. */
  baseWidth: z.number().int().min(1).max(32),
  topWidth: z.number().int().min(2).max(80),
  /** How far the top leans ahead of the base, in cells. */
  lean: z.number().int().min(0).max(60),
  /** Sideways wobble of the funnel, in cells at the top. */
  wobble: z.number().int().min(0).max(30),
  /** Ground speed, cells/tick. */
  speed: z.number().min(0).max(4),
  /** Loose cells sucked off the ground per tick, at full strength. */
  suck: z.number().int().min(0).max(80),
  /** Updraft: how fast debris rises up the funnel, cells/tick. */
  lift: z.number().min(0).max(8),
  /** How fast a caught tank is lifted, cells/tick, and how high it is carried. */
  tankLift: z.number().min(0).max(4),
  carry: z.number().int().min(0).max(200),
  /** Speed a tank is thrown out of the funnel with, cells/tick. */
  throw: z.number().min(0).max(8),
  /** Speed debris is flung out with when the funnel breaks up, cells/tick. */
  fling: z.number().min(0).max(8),
});
type Params = z.infer<typeof params>;

// data: [x (fixed), dir, age, groundY, ...per tank: state, spin, tx, ty, vx, vy]
const X = 0;
const DIR = 1;
const AGE = 2;
const GY = 3;
const TANKS = 4;
const SLOT = 6;
const FREE = 0;
const CARRIED = 1;
const THROWN = 2;
const DONE = 3;
/** Fixed-point strength scale. */
const S1 = 256;
/** Spring stiffness of the orbit (1/K per tick): one turn every ~2π√K ticks. */
const K = 12;

/** 0..S1: how much tornado there is at `age`. Zero until it touches down. */
function strength(p: Params, age: number): number {
  if (age < p.touchdown) return 0;
  const up = age - p.touchdown;
  const rise = up >= 20 ? S1 : Math.trunc((up * S1) / 20);
  const left = p.life - age;
  const fall = left >= p.ropeOut ? S1 : Math.max(0, Math.trunc((left * S1) / p.ropeOut));
  return Math.min(rise, fall);
}

/** Funnel half-width at height h (cells): flares out toward the top; thins as it ropes out. */
function widthAt(p: Params, h: number, s: number): number {
  const hh = Math.max(0, Math.min(p.height, h));
  const full =
    p.baseWidth + Math.trunc(((p.topWidth - p.baseWidth) * hh * hh) / (p.height * p.height));
  return Math.max(1, Math.trunc((full * Math.max(s, S1 / 3)) / S1));
}

/** Funnel centre at height h above the base, fixed-point x. */
function centreAt(p: Params, d: number[], h: number): number {
  const hh = Math.max(0, Math.min(p.height, h));
  const age = d[AGE]!;
  const lean = Math.trunc((d[DIR]! * p.lean * hh * FP) / p.height);
  const wob = Math.trunc((sinDeci(age * 25 + hh * 25) * p.wobble * hh) / p.height);
  return d[X]! + lean + wob;
}

/** Is any of a tank's body (bottom row `y`-1 and its middle row) in the ground at column x? */
function blocked(api: SimApi, x: number, y: number): boolean {
  const g = api.grid;
  for (const row of [y - 1, y - (TANK_H >> 1)]) {
    if (row < 0) continue;
    if (row >= g.height) return true;
    for (let xx = x - TANK_HALF; xx < x + TANK_HALF; xx++) {
      if (xx < 0 || xx >= g.width) return true;
      if (g.material[row * g.width + xx] !== 0) return true;
    }
  }
  return false;
}

/** Ground row under the funnel: the surface at its column, eased so the base doesn't jitter. */
function ground(api: SimApi, x: number, prev: number): number {
  const sy = api.grid.surfaceY(x);
  if (prev < 0) return sy;
  return prev + Math.trunc((sy - prev) / 2);
}

/** Integer hash for per-cell variety (not the match RNG, so other rolls never shift). */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Ground speed this tick, fixed-point (signed): steady, with a slow surge. */
function groundSpeed(p: Params, d: number[]): number {
  const base = toFixed(p.speed);
  const surge = Math.trunc((base * sinDeci(d[AGE]! * 18)) / (FP * 3));
  return d[DIR]! * (base + surge);
}

/** Swirl the debris inside the funnel: spring orbit around the centre plus the updraft. */
function swirl(api: SimApi, p: Params, d: number[], s: number, fv: number, release: boolean): void {
  const db = api.debris;
  const gy = d[GY]!;
  const H = p.height;
  const lift = Math.trunc((toFixed(p.lift) * s) / S1);
  const fling = toFixed(p.fling);
  for (let i = 0; i < db.count; i++) {
    const py = Math.floor(db.y[i]! / FP);
    const h = gy - py;
    if (h < -8 || h > H + 24) continue;
    const w = widthAt(p, h, s);
    const dx = db.x[i]! - centreAt(p, d, h);
    const adx = dx < 0 ? -dx : dx;
    if (release) {
      if (adx > (w + 12) * FP) continue;
      // the funnel breaks up: everything it holds is thrown outward and rains down
      const out = dx < 0 ? -1 : 1;
      const k = 1 + (hash(i, d[AGE]!) % 3);
      db.vx[i] = db.vx[i]! + Math.trunc((out * fling * k) / 2);
      db.vy[i] = db.vy[i]! - Math.trunc(fling / 3);
      continue;
    }
    if (adx > (w + 10) * FP) {
      // inflow along the ground toward the base
      if (h < 24 && adx < (w + 40) * FP) {
        db.vx[i] = db.vx[i]! - Math.trunc((dx < 0 ? -FP : FP) / 14);
        db.vy[i] = db.vy[i]! - (api.gravity >> 1);
      }
      continue;
    }
    // Near the top it is thrown out of the funnel and rains down around it, where the inflow
    // sucks it back in: a fountain of dirt that drifts along with the base.
    const spill = (H * 3) >> 2;
    let target = -lift;
    if (h > spill) {
      target = -Math.trunc((lift * (H - h)) / (H - spill + 1));
      const jitter = (hash(i, d[AGE]!) & 0x3fff) - 0x2000;
      db.vx[i] = db.vx[i]! + Math.trunc((dx < 0 ? -FP : FP) / 7) + jitter;
    } else {
      // horizontal: a spring around the moving centre (the side view of a circular orbit)
      let rel = db.vx[i]! - fv - Math.trunc(dx / K);
      const dc = Math.trunc(dx / 256);
      const rc = Math.trunc(rel / 256);
      const a2 = dc * dc + K * rc * rc;
      const want = w * 256;
      if (a2 < want * want) rel += Math.trunc(rel / 20) + (rel < 0 ? -48 : 48);
      else rel -= Math.trunc(rel / 10);
      db.vx[i] = fv + rel;
    }
    // vertical: rise up the core, slowing into the spill
    const vy = db.vy[i]!;
    db.vy[i] = vy + Math.trunc((target - vy) / 6) - api.gravity;
  }
}

/** Pull loose cells off the ground around the base and send them up the funnel. */
function suck(api: SimApi, p: Params, c: OpCall, d: number[], s: number, fv: number): void {
  const n = Math.trunc((p.suck * s) / S1);
  if (n <= 0) return;
  const g = api.grid;
  const R = c.radius;
  const fx = Math.floor(d[X]! / FP);
  const gy = d[GY]!;
  const age = d[AGE]!;
  const lift = toFixed(p.lift);
  for (let k = 0; k < n; k++) {
    const r = hash(age, k);
    // closer to the centre more often: the base digs a trench along the track
    const o = Math.trunc((((r & 0xff) - 128) * (((r >>> 8) & 0xff) + 32)) / ((288 * 128) / R));
    const x = fx + Math.max(-R, Math.min(R, o));
    if (x < 0 || x >= g.width) continue;
    const sy = g.surfaceY(x);
    if (sy >= g.height || sy < gy - R || sy > gy + R) continue;
    const i = sy * g.width + x;
    const m = g.material[i]!;
    if (g.group[i] === 0 && api.mats.settle[m] === SETTLE_STATIC) continue;
    const spinKick = (((r >>> 16) & 0xff) - 128) * 640;
    const up = Math.trunc((lift * (128 + ((r >>> 24) & 0x7f))) / 256);
    api.launch(i, fv + spinKick - Math.trunc((x - fx) * FP) / 4, -up);
  }
  g.markDirty(fx - R - 2, gy - R - 2, fx + R + 2, Math.min(g.height - 1, gy + R + 2));
}

/** Catch, carry and throw tanks. Returns true while any tank is still in the air. */
function tanks(api: SimApi, p: Params, c: OpCall, d: number[], s: number, fv: number): boolean {
  const g = api.grid;
  const fx = Math.floor(d[X]! / FP);
  const gy = d[GY]!;
  const ending = d[AGE]! >= p.life - p.ropeOut;
  let busy = false;
  for (const t of api.tanks) {
    const b = TANKS + t.player * SLOT;
    if (b + SLOT > d.length) continue;
    let st = d[b]!;
    if (!t.alive) {
      if (st !== FREE) d[b] = DONE;
      continue;
    }
    if (st === FREE) {
      if (s < S1 >> 1 || ending) continue;
      if (Math.abs(t.x - fx) > c.radius + TANK_HALF || t.y < gy - 14 || t.y > gy + 18) continue;
      st = CARRIED;
      d[b] = st;
      d[b + 1] = t.x < fx ? 1800 : 0;
      d[b + 2] = t.x * FP;
      d[b + 3] = t.y * FP;
      api.emit('tornadoGrab', t.x, t.y, TANK_HALF);
    }
    if (st === CARRIED) {
      busy = true;
      const spin = d[b + 1]! + 72;
      d[b + 1] = spin;
      let ty = d[b + 3]! - toFixed(p.tankLift);
      const h = gy - Math.floor(ty / FP);
      const r = Math.trunc((widthAt(p, h, s) * 2) / 3);
      const target = centreAt(p, d, h) + r * cosDeci(spin);
      let tx = d[b + 2]! + Math.trunc((target - d[b + 2]!) / 4);
      if (blocked(api, Math.floor(tx / FP), Math.floor(ty / FP))) tx = d[b + 2]!;
      if (blocked(api, Math.floor(tx / FP), Math.floor(ty / FP))) ty -= FP;
      d[b + 2] = tx;
      d[b + 3] = ty;
      if (h >= p.carry || ending || s < S1 >> 2) {
        // flung out along the way it was circling, with the funnel's own speed
        const tangent = -sinDeci(spin) >= 0 ? 1 : -1;
        d[b] = THROWN;
        d[b + 4] = fv + tangent * toFixed(p.throw);
        d[b + 5] = -toFixed(p.throw) >> 1;
        api.emit('tornadoThrow', Math.floor(tx / FP), Math.floor(ty / FP), TANK_HALF);
      }
      api.hold(t.player, Math.floor(tx / FP), Math.floor(ty / FP));
      continue;
    }
    if (st === THROWN) {
      const vy = d[b + 5]! + api.gravity;
      const tx = d[b + 2]! + d[b + 4]!;
      const ty = d[b + 3]! + vy;
      const x = Math.floor(tx / FP);
      const y = Math.floor(ty / FP);
      if (
        x < TANK_HALF ||
        x >= g.width - TANK_HALF ||
        y < TANK_H ||
        y >= g.height ||
        blocked(api, x, y) ||
        g.material[y * g.width + x] !== 0
      ) {
        // it hits something: let go, and the kernel drops it from here with fall damage
        d[b] = DONE;
        continue;
      }
      busy = true;
      d[b + 2] = tx;
      d[b + 3] = ty;
      d[b + 5] = vy;
      api.hold(t.player, x, y);
    }
  }
  return busy;
}

function advance(api: SimApi, p: Params, inst: OpInstance): boolean {
  const d = inst.data;
  const c = inst.call;
  const age = d[AGE]!;
  const g = api.grid;
  const s = strength(p, age);
  const alive = age < p.life;
  const fv = alive && s > 0 ? groundSpeed(p, d) : 0;
  if (alive) {
    if (s > 0) d[X] = d[X]! + fv;
    const fx = Math.floor(d[X]! / FP);
    if (fx < 2 || fx >= g.width - 2) d[AGE] = p.life - Math.min(p.ropeOut, p.life - age);
    d[GY] = ground(api, Math.max(0, Math.min(g.width - 1, fx)), d[GY]!);
    // the shield checks and the hashed call follow the base
    c.x = Math.max(0, Math.min(g.width - 1, fx));
    c.y = d[GY]!;
    if (s > 0) {
      swirl(api, p, d, s, fv, false);
      suck(api, p, c, d, s, fv);
    }
    const down = age < p.touchdown ? Math.trunc((age * 100) / p.touchdown) : 100;
    api.emit('tornado', c.x, c.y, p.height, {
      base: p.baseWidth,
      top: p.topWidth,
      lean: d[DIR]! * p.lean,
      wobble: p.wobble,
      age,
      strength: Math.trunc((s * 100) / S1),
      down,
    });
    if (age === p.touchdown) api.emit('touchdown', c.x, c.y, p.height);
    if (age === p.life - 1) {
      swirl(api, p, d, S1, 0, true);
      api.emit('tornadoEnd', c.x, c.y - (p.height >> 1), p.topWidth);
    }
  }
  const busy = tanks(api, p, c, d, alive ? s : 0, fv);
  d[AGE] = d[AGE]! + 1;
  return alive || busy;
}

/**
 * Tornado (weapon.tornado): a funnel comes down out of the sky onto the impact point, then runs
 * along the ground with the wind (or away from the shooter in still air). It sucks loose ground
 * off the surface into a column of whirling debris, scooping a trench along its track, picks up
 * any tank it crosses, carries it up in circles and throws it out (fall damage does the rest).
 * When it ropes out, everything it holds is flung outward and rains back down as new terrain.
 * Rock, ice and buildings resist: buildings are battered (charged to their integrity) instead.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.tornado',
  version: 1,
  params,
  start(api, p, c) {
    const owner = api.tanks[c.owner];
    const dir = api.wind > 0 ? 1 : api.wind < 0 ? -1 : owner && owner.x > c.x ? -1 : 1;
    const data = [c.x * FP + FP / 2, dir, 0, -1];
    for (let i = 0; i < api.tanks.length; i++) data.push(FREE, 0, 0, 0, 0, 0);
    return data;
  },
  step(api, p, inst) {
    return advance(api, p, inst);
  },
});

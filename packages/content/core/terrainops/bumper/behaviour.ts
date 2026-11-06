import { z } from '@mudders/shared';
import {
  FP,
  defineTerrainOp,
  isqrt,
  toFixed,
  type OpCall,
  type SimApi,
  type TankHandle,
} from '@mudders/sim';

const params = z.strictObject({
  /** Ticks the bumper post takes to pop out of the ground before it kicks. */
  windup: z.number().int().min(1).max(60),
  /** Horizontal fling distance in cells: at the edge of the reach, and right on top of it. */
  minRange: z.number().int().min(10).max(800),
  maxRange: z.number().int().min(10).max(800),
  /** Random spread added to the distance, ± cells. */
  spread: z.number().int().min(0).max(200),
  /** Height of the arc above the launch point, cells. */
  apex: z.number().int().min(4).max(200),
  /**
   * Most cells of fall a landing counts for fall damage, however far below the top of the arc it
   * comes down (so a throw into a deep valley hurts no more than one onto level ground).
   */
  landFall: z.number().int().min(0).max(200),
  /** Under an open parachute: fall speed (cells/tick) and sideways speed kept per tick, %. */
  chuteFall: z.number().min(0.1).max(4),
  chuteDrag: z.number().int().min(50).max(100),
  /** Most bounces off walls, slopes and the map edge before the tank just drops. */
  bounces: z.number().int().min(0).max(12),
  /** Speed kept per bounce, percent. */
  restitution: z.number().int().min(10).max(100),
});
type Params = z.infer<typeof params>;

// data: [age, ...per tank: state, x (fixed), y (fixed), vx, vy, bounces]
const AGE = 0;
const TANKS = 1;
const SLOT = 6;
const FREE = 0;
const WAIT = 1;
const FLY = 2;
const DONE = 3;

/** Is any of a tank's body (bottom row `y`-1 and its middle row) in the ground at column x? */
function blocked(api: SimApi, t: TankHandle, x: number, y: number): boolean {
  const g = api.grid;
  for (const row of [y - 1, y - (t.h >> 1)]) {
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

/** Pick the tanks in reach (everyone but the shooter) and work out their throws. */
function launch(api: SimApi, p: Params, c: OpCall, d: number[]): void {
  const owner = api.tanks[c.owner];
  // vertical launch speed for the apex height, and the airtime back down to the same row
  const vy0 = isqrt(2 * api.gravity * p.apex * FP);
  const air = Math.max(1, Math.trunc((2 * vy0) / Math.max(1, api.gravity)));
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
    // closer to the post: kicked harder and farther, like a pinball off a bumper
    const k = Math.max(0, reach - dist);
    const range =
      p.minRange +
      Math.trunc(((p.maxRange - p.minRange) * k) / reach) +
      (p.spread > 0 ? api.rng.int(2 * p.spread + 1) - p.spread : 0);
    const dir = dx > 0 ? 1 : dx < 0 ? -1 : owner && owner.x > c.x ? -1 : 1;
    d[b] = FLY;
    d[b + 1] = t.x * FP + FP / 2;
    d[b + 2] = t.y * FP;
    d[b + 3] = Math.trunc((dir * Math.max(1, range) * FP) / air);
    d[b + 4] = -vy0;
    d[b + 5] = 0;
    api.emit('bumpLaunch', t.x, t.y - (t.h >> 1), t.half, { player: t.player, dir });
  }
}

/** A thrown tank bounces off something (fixed-point position). */
function bonk(api: SimApi, t: TankHandle, x: number, y: number): void {
  const cy = Math.floor(y / FP) - (t.h >> 1);
  api.emit('bumpBounce', Math.floor(x / FP), cy, t.half, { player: t.player });
}

/** One tick of a thrown tank's flight. Returns true while it is still in the air. */
function fly(api: SimApi, p: Params, t: TankHandle, d: number[], b: number): boolean {
  const g = api.grid;
  let x = d[b + 1]!;
  let y = d[b + 2]!;
  let vx = d[b + 3]!;
  let vy = d[b + 4]! + api.gravity;
  if (t.chute) {
    // a parachute opened on the way down: it floats on along the throw, slowing
    vy = Math.min(vy, toFixed(p.chuteFall));
    vx = Math.trunc((vx * p.chuteDrag) / 100);
  }
  let bounces = d[b + 5]!;
  // sub-steps of at most one cell, so it can't tunnel through a thin wall or a roof
  const fast = Math.max(Math.abs(vx), Math.abs(vy));
  const steps = Math.max(1, Math.ceil(fast / FP));
  let flying = true;
  let landed = false;
  for (let s = 0; s < steps && flying; s++) {
    let nx = x + Math.trunc(vx / steps);
    let ny = y + Math.trunc(vy / steps);
    let cx = Math.floor(nx / FP);
    let cy = Math.floor(ny / FP);
    // the map's edges are the table's rails: it bounces back in
    if (cx < t.half || cx > g.width - 1 - t.half) {
      vx = -Math.trunc((vx * p.restitution) / 100);
      bounces++;
      bonk(api, t, x, y);
      nx = x;
      cx = Math.floor(nx / FP);
    }
    if (cy >= g.height) {
      flying = false;
      break;
    }
    if (cy < t.h) {
      // top of the map: bonk, and come back down
      ny = t.h * FP;
      cy = t.h;
      if (vy < 0) vy = 0;
    }
    if (blocked(api, t, cx, cy)) {
      const ox = Math.floor(x / FP);
      const oy = Math.floor(y / FP);
      if (!blocked(api, t, ox, cy)) {
        // a hillside or a wall: bounce off it sideways
        vx = -Math.trunc((vx * p.restitution) / 100);
        bounces++;
        bonk(api, t, x, y);
        nx = x;
      } else if (vy < 0 && !blocked(api, t, cx, oy)) {
        // a roof: stop rising
        vy = 0;
        ny = y;
      } else {
        flying = false;
        break;
      }
    } else if (vy > 0 && footing(api, t, cx, cy)) {
      // touchdown: put it on the ground and let the kernel land it (fall damage, chutes)
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
  if (landed) api.hold(t.player, hx, hy, hy - p.landFall);
  else api.hold(t.player, hx, hy);
  if (flying) api.emit('bumpFly', hx, hy - (t.h >> 1), t.half, { player: t.player });
  return flying;
}

/**
 * Bumper (weapon.bumper): a pinball bumper post pops out of the ground where the shell lands and,
 * after a short wind-up, kicks every tank in reach (except the shooter) clean across the map: the
 * closer to the post, the farther it flies. A thrown tank flies a fixed-height arc, bounces off
 * hillsides, walls and the map's edges, and lands wherever it comes down. The kernel then lands
 * it as a normal fall: fall damage (counted over at most `landFall` cells), shields soak it, and
 * a parachute opens on the way down and floats it on along the throw. No terrain is touched.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.bumper',
  version: 1,
  params,
  start(api, p, c) {
    const data = [0];
    for (const t of api.tanks) {
      const dx = t.x - c.x;
      const dy = t.y - (t.h >> 1) - c.y;
      const reach = c.radius + t.half;
      const hit = t.alive && t.player !== c.owner && dx * dx + dy * dy <= reach * reach;
      data.push(hit ? WAIT : FREE, 0, 0, 0, 0, 0);
    }
    api.emit('bumper', c.x, c.y, c.radius, { windup: p.windup });
    return data;
  },
  step(api, p, inst) {
    const d = inst.data;
    const c = inst.call;
    const age = d[AGE]!;
    if (age === p.windup) {
      api.emit('bumpKick', c.x, c.y, c.radius);
      launch(api, p, c, d);
    }
    let busy = age < p.windup;
    if (age >= p.windup) {
      for (const t of api.tanks) {
        const b = TANKS + t.player * SLOT;
        if (b + SLOT > d.length || d[b] !== FLY) continue;
        if (!t.alive) {
          d[b] = DONE;
          continue;
        }
        if (fly(api, p, t, d, b)) busy = true;
        else d[b] = DONE;
      }
    }
    d[AGE] = age + 1;
    return busy;
  },
});

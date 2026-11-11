import { z } from '@mudders/shared';
import { FP, SETTLE_GAS, SETTLE_STATIC, defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Ticks the column takes to open before anything lifts (the hum and shimmer build up). */
  open: z.number().int().min(0).max(120),
  /** Ticks gravity stays flipped inside the column. */
  ticks: z.number().int().min(10).max(600),
  /** Half-width of the column, cells. */
  half: z.number().int().min(4).max(120),
  /** How far above the ground at the centre things rise before they hang there, cells. */
  height: z.number().int().min(10).max(400),
  /** Deepest it tears the ground, cells below the impact row. */
  depth: z.number().int().min(0).max(200),
  /** Loose cells torn off the top of the ground per tick, and in total. */
  perTick: z.number().int().min(1).max(200),
  cells: z.number().int().min(0).max(12000),
  /** Top speed things fall upwards at, cells/tick. */
  rise: z.number().min(0.1).max(8),
  /** How far tanks are carried up, cells, and ticks per cell they rise. */
  tankLift: z.number().int().min(0).max(200),
  tankEvery: z.number().int().min(1).max(30),
});
type Params = z.infer<typeof params>;

// state slots
const AGE = 0;
const GROUND = 1;
const TOP = 2;
const LIFTED = 3;
/** Per tank: the row it started rising from (0 = not caught). */
const TANKS = 4;

/** Inside the column at column x (cells)? */
function inside(c: { x: number }, p: Params, x: number): boolean {
  return x >= c.x - p.half && x <= c.x + p.half;
}

/** Tear `n` loose cells off the top of the ground inside the column and throw them upwards. */
function tear(api: SimApi, p: Params, cx: number, floor: number, n: number): number {
  const g = api.grid;
  const W = g.width;
  const H = g.height;
  const settle = api.mats.settle;
  let done = 0;
  for (let k = 0; k < n * 2 && done < n; k++) {
    const off = api.rng.int(2 * p.half + 1) - p.half;
    const x = cx + off;
    if (x < 0 || x >= W) continue;
    let y = 0;
    let i = x;
    while (y < H && g.material[i] === 0) {
      y++;
      i += W;
    }
    if (y >= H || y > floor) continue;
    const m = g.material[i]!;
    const s = settle[m]!;
    if (s === SETTLE_GAS) continue;
    // bedrock and stone stay put; objects (trees, houses) are torn up with the ground
    if (s === SETTLE_STATIC && g.group[i] === 0) continue;
    let under = false;
    for (const t of api.tanks) {
      if (t.alive && x >= t.x - t.half - 1 && x <= t.x + t.half + 1 && y >= t.y - 2 && y <= t.y + 2)
        under = true;
    }
    if (under) continue;
    const vx = api.rng.int(FP >> 1) - (FP >> 2);
    const vy = -(FP >> 2) - api.rng.int(FP >> 1);
    if (api.launch(i, vx, vy)) done++;
  }
  return done;
}

/** Everything loose in the column falls up: debris and shells are pulled towards the sky. */
function pull(api: SimApi, p: Params, cx: number, top: number): void {
  const d = api.debris;
  const rise = Math.round(p.rise * FP);
  const g = api.gravity;
  const x0 = (cx - p.half) * FP;
  const x1 = (cx + p.half + 1) * FP;
  const mid = cx * FP + (FP >> 1);
  const band = 24 * FP;
  const topF = top * FP;
  for (let i = 0; i < d.count; i++) {
    const x = d.x[i]!;
    if (x < x0 || x >= x1) continue;
    const y = d.y[i]!;
    // each grain hangs at its own height in a band under the top, so it churns as a cloud
    const hang = topF + ((Math.imul(i, 0x9e3779b1) >>> 0) % 48) * FP;
    let want = -rise;
    if (y < hang + band) want = Math.trunc((-rise * (y - hang)) / band);
    const vy = d.vy[i]!;
    // cancel gravity (debris.step adds it after us) and ease towards the wanted speed
    d.vy[i] = vy + Math.trunc((want - vy) / 6) - g;
    // a slow churn: damped, kept off the walls, with a sway that flips with height
    const sway = ((y >> 19) & 1) === 0 ? FP >> 7 : -(FP >> 7);
    const wall = x < x0 + 4 * FP || x >= x1 - 4 * FP ? Math.trunc((mid - x) / 256) : 0;
    d.vx[i] = d.vx[i]! - (d.vx[i]! >> 3) + wall + sway;
  }
  for (const s of api.projectiles) {
    if (!s.alive || s.x < x0 || s.x >= x1) continue;
    const want = s.y < topF + band ? 0 : -rise;
    api.steerShell(s.id, s.vx - (s.vx >> 5), s.vy + Math.trunc((want - s.vy) / 6) - 2 * g);
  }
}

/** Carry the tanks standing in the column up into the sky, a cell at a time. */
function lift(api: SimApi, p: Params, cx: number, d: number[], age: number): void {
  const g = api.grid;
  const W = g.width;
  for (const t of api.tanks) {
    const s = TANKS + t.player;
    if (s >= d.length) continue;
    if (!t.alive || t.glue > 0) continue;
    if (d[s] === 0) {
      if (!inside({ x: cx }, p, t.x)) continue;
      d[s] = t.y;
    }
    const from = d[s]!;
    let y = t.y;
    if (age % p.tankEvery === 0 && y > from - p.tankLift && y - t.h - 1 > 0) {
      // only into open air
      let clear = true;
      const row = y - t.h - 1;
      for (let x = Math.max(0, t.x - t.half); x <= Math.min(W - 1, t.x + t.half); x++)
        if (g.material[row * W + x] !== 0) clear = false;
      if (clear) y--;
    }
    api.hold(t.player, t.x, y);
  }
}

/**
 * Upfall: gravity flips inside a tall column for a few seconds. Loose ground, water, lava,
 * trees and houses at the top of it are torn up and fall into the sky, tanks standing in it float
 * up, and shells flying through are pulled up and away. Everything hangs churning high above,
 * and when the column shuts it all comes crashing back down at once. Stone and bedrock stay put.
 *
 * Emits `upfall` every tick (x, ground row, half-width; age, top row, phase), `upfallOpen` at the
 * start and `upfallDrop` when it lets go.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.upfall',
  version: 1,
  params,
  start(api, p, c) {
    const ground = Math.max(0, Math.min(api.grid.height - 1, c.y));
    const top = Math.max(2, ground - p.height);
    api.emit('upfallOpen', c.x, ground, p.half, { top });
    const d = [0, ground, top, 0];
    for (let k = 0; k < api.tanks.length; k++) d.push(0);
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const c = inst.call;
    const age = d[AGE]! + 1;
    d[AGE] = age;
    const top = d[TOP]!;
    if (age > p.open + p.ticks) {
      api.emit('upfallDrop', c.x, top, p.half, { lifted: d[LIFTED]! });
      return false;
    }
    const on = age > p.open;
    if (on) {
      if (d[LIFTED]! < p.cells) {
        // the tear ramps up over the first second
        const ramp = Math.min(p.perTick, 1 + Math.trunc((p.perTick * (age - p.open)) / 40));
        d[LIFTED] =
          d[LIFTED]! +
          tear(api, p, c.x, d[GROUND]! + p.depth, Math.min(ramp, p.cells - d[LIFTED]!));
      }
      pull(api, p, c.x, top);
      lift(api, p, c.x, d, age);
    }
    api.emit('upfall', c.x, d[GROUND]!, p.half, {
      age,
      top,
      on: on ? 1 : 0,
      left: p.open + p.ticks - age,
    });
    return true;
  },
});

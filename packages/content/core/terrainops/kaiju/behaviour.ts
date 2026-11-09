import { z } from '@mudders/shared';
import {
  FP,
  defineTerrainOp,
  isqrt,
  type OpCall,
  type SimApi,
  type TankHandle,
} from '@mudders/sim';
import { fly } from '../bumper/behaviour';

const params = z.strictObject({
  /** Ticks it takes to claw its way up out of the ground, and to sink back at the end. */
  rise: z.number().int().min(10).max(240),
  sink: z.number().int().min(10).max(240),
  /** How long it stays: this many full turn rotations (every tank alive at the summons, once). */
  rounds: z.number().int().min(1).max(10),
  /** Height of the monster standing, cells (its hands work at the top). */
  height: z.number().int().min(20).max(240),
  /** A tank whose hull comes within this many columns of the monster gets grabbed. */
  grabReach: z.number().int().min(8).max(160),
  /** A shell that flies within this many cells of its chest gets caught. */
  catchReach: z.number().int().min(8).max(200),
  /** Ticks its hand takes to reach a tank, and to haul it up overhead. */
  reach: z.number().int().min(1).max(60),
  lift: z.number().int().min(1).max(120),
  /** Ticks it holds caught shells before it hurls them, and its pause after any throw. */
  hold: z.number().int().min(1).max(120),
  recover: z.number().int().min(1).max(120),
  /** Most tanks it grabs in one turn (stops a tank bounced back into reach looping forever). */
  maxGrabs: z.number().int().min(1).max(16),
  /** Throw distance in columns (a random pick in between), and the arc's height above the hand. */
  minRange: z.number().int().min(10).max(800),
  maxRange: z.number().int().min(10).max(800),
  apex: z.number().int().min(4).max(200),
  /** Thrown tanks: see terrainop.bumper. */
  landFall: z.number().int().min(0).max(200),
  chuteFall: z.number().min(0.1).max(4),
  chuteDrag: z.number().int().min(50).max(100),
  bounces: z.number().int().min(0).max(12),
  restitution: z.number().int().min(10).max(100),
  /** Caught shells are hurled anywhere on the map: launch speed range, cells/tick (×10). */
  tossMin: z.number().int().min(10).max(120),
  tossMax: z.number().int().min(10).max(120),
  /** Objects (houses, trees) in reach are ripped apart and thrown: reach, cells per tick, ticks. */
  ripReach: z.number().int().min(8).max(160),
  ripCells: z.number().int().min(1).max(200),
  ripTicks: z.number().int().min(1).max(120),
  /** Ticks between looks for something to rip up while it stands idle. */
  ripEvery: z.number().int().min(1).max(600),
  /** Cells blasted up out of the ground per tick while it rises. */
  erupt: z.number().int().min(0).max(60),
  /**
   * Dug out: once the ground under it has dropped away by more than `toppleDrop` cells, it topples
   * over for `topple` ticks and bursts where it falls, flinging every tank within `blast` cells
   * (its own side too) and up to `blastCells` cells of ground.
   */
  toppleDrop: z.number().int().min(4).max(400),
  topple: z.number().int().min(4).max(120),
  blast: z.number().int().min(8).max(160),
  blastCells: z.number().int().min(0).max(1200),
});
type Params = z.infer<typeof params>;

// states
const RISE = 0;
const IDLE = 1;
const GRAB = 2;
const RECOVER = 3;
const TOSS = 4;
const RIP = 5;
const SINK = 6;
const TOPPLE = 7;

// header slots
const AGE = 0;
const STATE = 1;
const TIMER = 2;
const START = 3;
const LIFE = 4;
const GROUND = 5;
const FACE = 6;
const TARGET = 7;
const GRAB_TURN = 8;
const GRABS = 9;
const RIP_X0 = 10;
const RIP_Y0 = 11;
const RIP_X1 = 12;
const RIP_Y1 = 13;
const COOL = 14;
const HAND_X = 15;
const HAND_Y = 16;
const HELD = 17;
/** Caught shells, weapon and owner per slot. */
const MAX_HELD = 6;
const HELD_AT = 18;
/** Ids of shells it threw (so it doesn't catch them straight back), a ring. */
const IGNORE = 8;
const IGN_POS = HELD_AT + 2 * MAX_HELD;
const IGN_AT = IGN_POS + 1;
/** Where the first shell in hand was caught (its hand swings from there up overhead). */
const CATCH_X = IGN_AT + IGNORE;
const CATCH_Y = CATCH_X + 1;
/** The ground row it burst out of and the mound top it heaves that ground up to. */
const HEAVE_FROM = CATCH_Y + 1;
const HEAVE_TO = HEAVE_FROM + 1;
const TANKS = HEAVE_TO + 1;
/** Per tank: thrown-flight slot (see bumper's `fly`). */
const SLOT = 6;
const FREE = 0;
const FLY = 2;

/** Half the monster's body width, cells (where its hands start from). */
const BODY_HALF = 12;
/** Columns kept clear of the map edge for its body and tail. */
const EDGE = 40;

/** Top of the ground at column x at or above row y (the first solid cell under the air). */
function surfaceAt(api: SimApi, x: number, y: number): number {
  const g = api.grid;
  let r = Math.max(0, Math.min(g.height - 1, y));
  for (let k = 0; k < 64 && r > 0 && g.material[r * g.width + x] !== 0; k++) r--;
  while (r + 1 < g.height && g.material[(r + 1) * g.width + x] === 0) r++;
  return r + 1;
}

/** The point the monster holds things at overhead (its hands raised). */
function overhead(p: Params, c: OpCall, d: number[]): [number, number] {
  // between its raised hands, just in front of its crown
  return [c.x - d[FACE]! * Math.trunc(p.height / 16), d[GROUND]! - p.height + 6];
}

function teamOf(api: SimApi, player: number): number {
  return api.tanks[player]?.team ?? player;
}

/** The tank to grab now: a live, unglued enemy in reach, nearest first, or -1. */
function findTank(api: SimApi, p: Params, c: OpCall, d: number[]): number {
  const team = teamOf(api, c.owner);
  const ground = d[GROUND]!;
  let best = -1;
  let bestD = 1 << 30;
  for (const t of api.tanks) {
    if (!t.alive || t.glue > 0 || t.team === team) continue;
    const s = TANKS + t.player * SLOT;
    if (s + SLOT <= d.length && d[s] === FLY) continue;
    const dx = Math.abs(t.x - c.x) - t.half;
    if (dx > p.grabReach) continue;
    if (t.y < ground - p.height - 16 || t.y - t.h > ground + 24) continue;
    if (dx < bestD) {
      bestD = dx;
      best = t.player;
    }
  }
  return best;
}

/** Catch every enemy shell inside its reach (up to MAX_HELD in hand). */
function catchShells(api: SimApi, p: Params, c: OpCall, d: number[]): void {
  if (api.projectiles.length === 0) return;
  const team = teamOf(api, c.owner);
  const cx = c.x;
  const cy = d[GROUND]! - (p.height >> 1);
  // its body: an upright ellipse, catchReach wide each side and its whole height tall
  const rx = Math.max(1, p.catchReach);
  const ry = (p.height >> 1) + 8;
  // ids first: catching changes the list
  let n = 0;
  const ids = scratchIds;
  for (const s of api.projectiles) {
    if (!s.alive || teamOf(api, s.owner) === team || n >= ids.length) continue;
    let mine = false;
    for (let k = 0; k < IGNORE; k++) if (d[IGN_AT + k] === s.id) mine = true;
    if (mine) continue;
    const dx = Math.floor(s.x / FP) - cx;
    const dy = Math.floor(s.y / FP) - cy;
    if (dx * dx * ry * ry + dy * dy * rx * rx > rx * rx * ry * ry) continue;
    ids[n++] = s.id;
  }
  for (let k = 0; k < n; k++) {
    if (d[HELD]! >= MAX_HELD) break;
    const id = ids[k]!;
    let shell: { weapon: number; owner: number; x: number; y: number } | undefined;
    for (const s of api.projectiles) if (s.id === id) shell = s;
    if (!shell || !api.catchShell(id)) continue;
    if (d[HELD] === 0) {
      d[CATCH_X] = Math.floor(shell.x / FP);
      d[CATCH_Y] = Math.floor(shell.y / FP);
    }
    const h = HELD_AT + 2 * d[HELD]!;
    d[h] = shell.weapon;
    d[h + 1] = shell.owner;
    d[HELD] = d[HELD]! + 1;
    d[FACE] = Math.floor(shell.x / FP) >= cx ? 1 : -1;
    api.emit('kaijuCatch', Math.floor(shell.x / FP), Math.floor(shell.y / FP), 6, {
      held: d[HELD]!,
    });
  }
}
const scratchIds = new Int32Array(64);

/** Hurl every shell in hand to random spots anywhere on the map. */
function toss(api: SimApi, p: Params, c: OpCall, d: number[]): void {
  const [hx, hy] = overhead(p, c, d);
  const g = api.grid;
  const grav = Math.max(1, api.gravity);
  for (let k = 0; k < d[HELD]!; k++) {
    const h = HELD_AT + 2 * k;
    const tx = 24 + api.rng.int(Math.max(1, g.width - 48));
    const speed = p.tossMin + api.rng.int(Math.max(1, p.tossMax - p.tossMin + 1));
    const vy = -Math.trunc((speed * FP) / 10);
    // airtime down to the ground at the target (still air), then the sideways speed for it
    const drop = Math.max(0, Math.min(g.height - 1, g.surfaceY(tx)) - hy);
    const air = Math.max(1, Math.trunc((-vy + isqrt(vy * vy + 2 * grav * drop * FP)) / grav));
    const vx = Math.max(-8 * FP, Math.min(8 * FP, Math.trunc(((tx - hx) * FP) / air)));
    const id = api.throwShell(d[h]!, d[h + 1]!, hx * FP + FP / 2, hy * FP, vx, vy);
    if (id >= 0) {
      d[IGN_AT + d[IGN_POS]!] = id;
      d[IGN_POS] = (d[IGN_POS]! + 1) % IGNORE;
    }
    api.emit('kaijuToss', hx, hy, 8, { dir: vx >= 0 ? 1 : -1 });
  }
  d[HELD] = 0;
}

/** Look for an object (a house, a tree) in reach; mark its box to rip up. */
function findProp(api: SimApi, p: Params, c: OpCall, d: number[]): boolean {
  const g = api.grid;
  const W = g.width;
  const ground = d[GROUND]!;
  const x0 = Math.max(0, c.x - p.ripReach);
  const x1 = Math.min(W - 1, c.x + p.ripReach);
  const y0 = Math.max(0, ground - p.height - 20);
  const y1 = Math.min(g.height - 1, ground + 8);
  let best = -1;
  let bestD = 1 << 30;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
      if (g.group[i] === 0 || g.material[i] === 0) continue;
      const dd = Math.abs(x - c.x) + Math.abs(y - ground);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
  }
  if (best < 0) return false;
  // the object's box: every cell of the same group near it
  const slot = g.group[best]!;
  const bx = best % W;
  const by = (best - bx) / W;
  let rx0 = bx;
  let rx1 = bx;
  let ry0 = by;
  let ry1 = by;
  for (let y = Math.max(0, by - 40); y <= Math.min(g.height - 1, by + 40); y++) {
    for (let x = Math.max(0, bx - 40), i = y * W + x; x <= Math.min(W - 1, bx + 40); x++, i++) {
      if (g.group[i] !== slot) continue;
      if (x < rx0) rx0 = x;
      if (x > rx1) rx1 = x;
      if (y < ry0) ry0 = y;
      if (y > ry1) ry1 = y;
    }
  }
  d[RIP_X0] = rx0;
  d[RIP_Y0] = ry0;
  d[RIP_X1] = rx1;
  d[RIP_Y1] = ry1;
  d[FACE] = (rx0 + rx1) >> 1 >= c.x ? 1 : -1;
  return true;
}

/** Tear cells out of the marked object and fling them away from the monster. */
function rip(api: SimApi, p: Params, c: OpCall, d: number[]): number {
  const g = api.grid;
  const W = g.width;
  let n = 0;
  for (let y = d[RIP_Y0]!; y <= d[RIP_Y1]! && n < p.ripCells; y++) {
    for (let x = d[RIP_X0]!, i = y * W + x; x <= d[RIP_X1]! && n < p.ripCells; x++, i++) {
      if (g.material[i] === 0) continue;
      const dir = x >= c.x ? 1 : -1;
      const vx = dir * (2 * FP + api.rng.int(3 * FP));
      const vy = -(2 * FP + api.rng.int(3 * FP));
      // an intact object refuses at first (its integrity takes the hit) and then gives way
      api.launch(i, vx, vy);
      n++;
    }
  }
  return n;
}

/** Throw the held tank: a high arc away from the monster, slammed down where it lands. */
function throwTank(api: SimApi, p: Params, c: OpCall, d: number[], t: TankHandle): void {
  const [hx, hy] = overhead(p, c, d);
  const vy0 = isqrt(2 * api.gravity * p.apex * FP);
  const air = Math.max(1, Math.trunc((2 * vy0) / Math.max(1, api.gravity)));
  const range = p.minRange + api.rng.int(Math.max(1, p.maxRange - p.minRange + 1));
  const s = TANKS + t.player * SLOT;
  d[s] = FLY;
  d[s + 1] = hx * FP + FP / 2;
  d[s + 2] = hy * FP;
  d[s + 3] = Math.trunc((d[FACE]! * range * FP) / air);
  d[s + 4] = -vy0;
  d[s + 5] = 0;
  api.emit('kaijuThrow', hx, hy, t.half, { player: t.player, dir: d[FACE]! });
}

/**
 * It has toppled over and bursts where it lands (its body across the ground towards where it
 * faced): ground flung out of a ragged bowl, and every tank in reach, its own side's too, thrown
 * clear (fall damage, as a thrown tank).
 */
function blowUp(api: SimApi, p: Params, c: OpCall, d: number[], ground: number): void {
  const g = api.grid;
  const W = g.width;
  const face = d[FACE]!;
  const bx = Math.max(0, Math.min(W - 1, c.x + face * Math.trunc((p.height * 45) / 100)));
  const by = Math.min(g.height - 1, surfaceAt(api, bx, ground));
  const r = p.blast >> 1;
  let flung = 0;
  for (let k = 0; k < p.blastCells * 3 && flung < p.blastCells; k++) {
    const dx = api.rng.int(2 * r + 1) - r;
    const dy = api.rng.int(r + 1) - (r >> 2);
    if (dx * dx + dy * dy * 4 > r * r) continue;
    const x = bx + dx;
    const y = by + dy;
    if (x < 0 || x >= W || y < 0 || y >= g.height) continue;
    const i = y * W + x;
    if (g.material[i] === 0) continue;
    const side = dx >= 0 ? 1 : -1;
    if (api.launch(i, side * (FP + api.rng.int(4 * FP)), -(3 * FP + api.rng.int(5 * FP)))) flung++;
  }
  for (const t of api.tanks) {
    if (!t.alive) continue;
    const s = TANKS + t.player * SLOT;
    if (s + SLOT > d.length || d[s] === FLY) continue;
    const dx = t.x - bx;
    const dy = t.y - (t.h >> 1) - by;
    if (dx * dx + dy * dy > p.blast * p.blast) continue;
    const dir = dx > 0 ? 1 : dx < 0 ? -1 : face;
    const push = p.blast - Math.min(p.blast, Math.abs(dx));
    const vy0 = isqrt(2 * api.gravity * (24 + push) * FP);
    d[s] = FLY;
    d[s + 1] = t.x * FP + FP / 2;
    d[s + 2] = (t.y - 1) * FP;
    d[s + 3] = dir * (FP + Math.trunc((push * FP) / 12));
    d[s + 4] = -vy0;
    d[s + 5] = 0;
  }
  api.emit('kaijuBlast', bx, by, p.blast, { dir: face });
}

/**
 * Where it bursts out, it heaves the ground up under its feet: a level footing at its feet's row
 * across its stance (raised a little more each tick by the caller), the air under it packed with
 * the ground it stands on, easing into the land on either side. So it never floats
 * over a slope or stands half inside one.
 */
function stance(api: SimApi, p: Params, c: OpCall, ground: number, num: number, den: number): void {
  const g = api.grid;
  const W = g.width;
  const half = Math.max(BODY_HALF, (p.height >> 2) + 2);
  // past the footing a skirt eases the heave back into the land around it (smoothstep, a cell of
  // jitter), and swells with the heave (num / den of the way up), so it reads as ground pushed up
  // from below, not a pedestal
  const skirt = 44;
  const k3 = skirt * skirt * skirt;
  const x0 = Math.max(0, c.x - half - skirt);
  const x1 = Math.min(W - 1, c.x + half + skirt);
  if (ground >= g.height) return;
  let fill = g.material[ground * W + c.x]!;
  for (let y = ground; fill === 0 && y < g.height; y++) fill = g.material[y * W + c.x]!;
  if (fill === 0) return;
  const top = ground;
  let bottom = ground;
  for (let x = x0; x <= x1; x++) {
    const out = Math.max(0, Math.abs(x - c.x) - half);
    let target = ground;
    if (out > 0) {
      const s = surfaceAt(api, x, ground);
      if (s <= ground) continue; // already at or above the heave here: left as it is
      const n = skirt - out;
      target = s + Math.trunc(((ground - s) * n * n * (3 * skirt - 2 * n) * num) / (k3 * den));
      if (out < skirt - 2) target += api.rng.int(3) - 1;
    }
    // fill the air below the target row down to the old surface (never cuts: it heaves up)
    for (
      let y = Math.max(0, target), k = 0;
      y < g.height && k < 60 && g.material[y * W + x] === 0;
      y++, k++
    ) {
      g.set(x, y, fill);
      if (y > bottom) bottom = y;
    }
  }
  g.markDirty(x0, top, x1, bottom);
  // tanks on the heaving ground ride up on it instead of being buried
  for (const t of api.tanks) {
    if (!t.alive || t.x + t.half < x0 || t.x - t.half > x1) continue;
    let y = t.y;
    for (let x = Math.max(0, t.x - t.half); x < Math.min(W, t.x + t.half); x++) {
      y = Math.min(y, surfaceAt(api, x, t.y));
    }
    if (y < t.y) t.y = y;
  }
}

function setState(d: number[], s: number): void {
  d[STATE] = s;
  d[TIMER] = 0;
}

/**
 * Kaiju (weapon.kaiju): a huge mud monster claws its way up out of the ground where the shell
 * lands and stays for `rounds` full turn rotations, a resident op that keeps working through
 * everyone's turns. Enemy tanks that come within `grabReach` are picked up, hauled overhead and
 * hurled far away to slam into the ground (fall damage over at most `landFall` cells, bounces as
 * a bumper throw); enemy shells that fly within `catchReach` of its chest are caught and hurled
 * to random spots anywhere on the map, where they go off as normal (still the shooter's). Houses
 * and trees in reach are ripped apart and thrown. It never touches its summoner's team. While it
 * stands idle it doesn't hold up the turn; when its time is up it sinks back into the ground.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.kaiju',
  version: 1,
  params,
  start(api, p, c) {
    const g = api.grid;
    c.x = Math.max(EDGE, Math.min(g.width - 1 - EDGE, c.x));
    const d = new Array<number>(TANKS + SLOT * api.tanks.length).fill(0);
    let alive = 0;
    for (const t of api.tanks) if (t.alive) alive++;
    d[STATE] = RISE;
    d[START] = api.turn;
    d[LIFE] = p.rounds * Math.max(1, alive);
    d[GROUND] = surfaceAt(api, c.x, c.y);
    const owner = api.tanks[c.owner];
    d[FACE] = owner && owner.x > c.x ? -1 : 1;
    d[TARGET] = -1;
    d[GRAB_TURN] = -1;
    for (let k = 0; k < IGNORE; k++) d[IGN_AT + k] = -1;
    api.emit('kaijuRise', c.x, d[GROUND], p.height, { rise: p.rise });
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const c = inst.call;
    const g = api.grid;
    d[AGE] = d[AGE]! + 1;
    d[TIMER] = d[TIMER]! + 1;
    if (d[GRAB_TURN] !== api.turn) {
      d[GRAB_TURN] = api.turn;
      d[GRABS] = 0;
    }
    // the ground went from under it: it drops with it (lost off the bottom of the map)
    let ground = d[GROUND]!;
    for (let k = 0; k < 4 && ground < g.height && g.material[ground * g.width + c.x] === 0; k++) {
      ground++;
    }
    if (ground >= g.height) {
      api.emit('kaijuGone', c.x, g.height - 1, p.height, {});
      return false;
    }
    d[GROUND] = ground;
    c.y = ground - (p.height >> 1);

    let state = d[STATE]!;
    const timer = d[TIMER]!;
    const [ohx, ohy] = overhead(p, c, d);
    let hx = c.x + d[FACE]! * Math.max(BODY_HALF, p.height >> 3);
    let hy = ground - (p.height >> 1);

    // first the ground quakes and cracks, then it bursts open and the monster climbs out
    const burst = Math.trunc(p.rise / 3);
    if (state === RISE && timer < burst) {
      if (timer % 4 === 1) api.emit('kaijuQuake', c.x, ground, p.height >> 2, { k: timer });
    } else if (state === RISE) {
      if (timer === burst) {
        // the surface blows open: a ring of ground flung up and outward
        const w = Math.max(BODY_HALF, p.height >> 2);
        for (let k = 0; k < p.erupt * 10; k++) {
          const x = c.x + api.rng.int(2 * w + 1) - w;
          if (x < 0 || x >= g.width) continue;
          const y = surfaceAt(api, x, ground) + api.rng.int(4);
          if (y >= g.height || y > ground + 10) continue;
          const dir = x >= c.x ? 1 : -1;
          api.launch(
            y * g.width + x,
            dir * (FP + api.rng.int(3 * FP)),
            -(2 * FP + api.rng.int(4 * FP)),
          );
        }
        // it heaves the ground up as it digs out: over the climb its feet rise on a growing mound
        // to above the highest ground across its stance, never into a cut
        const half = Math.max(BODY_HALF, (p.height >> 2) + 2);
        let hi = ground;
        for (let x = Math.max(0, c.x - half); x <= Math.min(g.width - 1, c.x + half); x++) {
          hi = Math.min(hi, surfaceAt(api, x, ground));
        }
        d[HEAVE_FROM] = ground;
        d[HEAVE_TO] = Math.max(8, Math.max(ground - 40, hi) - Math.max(2, p.height >> 4));
        api.emit('kaijuBurst', c.x, ground, w, {});
      }
      // the mound swells under it as it climbs (eased in and out, topping out before it stands)
      // and dirt sprays off its crown and flanks, refilled from below next tick
      const half = Math.max(BODY_HALF, (p.height >> 2) + 2);
      const span = Math.max(1, p.rise - burst - 12);
      const n = Math.min(timer - burst, span);
      const from = d[HEAVE_FROM]!;
      const to = d[HEAVE_TO]!;
      ground = from + Math.trunc(((to - from) * n * n * (3 * span - 2 * n)) / (span * span * span));
      d[GROUND] = ground;
      c.y = ground - (p.height >> 1);
      hy = c.y;
      stance(api, p, c, ground, n * n * (3 * span - 2 * n), span * span * span);
      if (n < span) {
        for (let k = 0; k < p.erupt * 2; k++) {
          const off = api.rng.int(2 * half + 25) - half - 12;
          const x = c.x + off;
          if (x < 0 || x >= g.width) continue;
          const y = surfaceAt(api, x, ground + 12);
          if (y >= g.height) continue;
          const side = off >= 0 ? 1 : -1;
          api.launch(
            y * g.width + x,
            side * (api.rng.int(3 * FP) + (FP >> 1)),
            -(2 * FP + api.rng.int(5 * FP)),
          );
        }
      }
      // the ground at the rim of its footing keeps being thrown up and aside as it climbs (never
      // the footing itself, or it would dig itself a hole)
      for (let k = 0; k < p.erupt; k++) {
        const side = api.rng.int(2) === 0 ? -1 : 1;
        const x = c.x + side * (half + 1 + api.rng.int(12));
        if (x < 0 || x >= g.width) continue;
        const y = surfaceAt(api, x, ground);
        if (y >= g.height || y >= ground) continue;
        api.launch(y * g.width + x, side * api.rng.int(2 * FP), -(FP + api.rng.int(3 * FP)));
      }
      if (timer >= p.rise) {
        setState(d, IDLE);
        state = IDLE;
        api.emit('kaijuRoar', c.x, ground - p.height, p.height, {});
      }
    }

    // dug out from under it (its feet dropped well below the mound it stood on, over any number of
    // blasts): it lets go of everything and topples over
    if (
      state !== RISE &&
      state !== SINK &&
      state !== TOPPLE &&
      ground - d[HEAVE_TO]! > p.toppleDrop
    ) {
      if (d[HELD]! > 0) toss(api, p, c, d);
      setState(d, TOPPLE);
      state = TOPPLE;
      api.emit('kaijuTopple', c.x, ground, p.height, { dir: d[FACE]!, topple: p.topple });
    }

    if (state !== RISE && state !== SINK && state !== TOPPLE) catchShells(api, p, c, d);

    if (state === IDLE) {
      let busyTanks = false;
      for (let i = TANKS; i + SLOT <= d.length; i += SLOT) if (d[i] === FLY) busyTanks = true;
      if (d[HELD]! > 0) {
        setState(d, TOSS);
        state = TOSS;
      } else if (!busyTanks && api.turn - d[START]! >= d[LIFE]!) {
        setState(d, SINK);
        state = SINK;
        api.emit('kaijuSink', c.x, ground, p.height, { sink: p.sink });
      } else {
        const t = d[GRABS]! < p.maxGrabs ? findTank(api, p, c, d) : -1;
        if (t >= 0) {
          const tk = api.tanks[t]!;
          d[TARGET] = t;
          d[GRABS] = d[GRABS]! + 1;
          d[FACE] = tk.x > c.x ? 1 : tk.x < c.x ? -1 : d[FACE]!;
          d[RIP_X0] = tk.x;
          d[RIP_Y0] = tk.y;
          setState(d, GRAB);
          state = GRAB;
          // a tank that drove up to it: that turn is over
          api.interrupt(c.owner);
          api.emit('kaijuGrab', tk.x, tk.y - (tk.h >> 1), tk.half, { player: t });
        } else {
          d[COOL] = d[COOL]! - 1;
          if (d[COOL]! <= 0) {
            d[COOL] = p.ripEvery;
            if (findProp(api, p, c, d)) {
              setState(d, RIP);
              state = RIP;
              api.emit('kaijuRip', (d[RIP_X0]! + d[RIP_X1]!) >> 1, d[RIP_Y0]!, 8, {});
            }
          }
        }
      }
    }

    const tm = d[TIMER]!;
    if (state === GRAB) {
      const t = api.tanks[d[TARGET]!];
      if (!t || !t.alive || t.glue > 0) {
        setState(d, RECOVER);
      } else {
        // where its low reaching claw closes (in front of its feet)
        const clawX = c.x + d[FACE]! * Math.trunc((p.height * 38) / 100);
        const clawY = ground - Math.trunc((p.height * 4) / 100);
        let x: number;
        let y: number;
        if (tm <= p.reach) {
          // the claw closes on the tank and drags it in
          const sx = d[RIP_X0]!;
          const sy = d[RIP_Y0]!;
          x = sx + Math.trunc(((clawX - sx) * tm) / p.reach);
          y = sy + Math.trunc(((clawY - sy) * tm) / p.reach);
        } else if (tm <= p.reach + p.lift) {
          // hauled up overhead
          const k = tm - p.reach;
          x = clawX + Math.trunc(((ohx - clawX) * k) / p.lift);
          y = clawY + Math.trunc(((ohy - clawY) * k) / p.lift);
        } else {
          // held up high a moment, then hurled
          x = ohx;
          y = ohy;
        }
        api.hold(t.player, x, y, y);
        hx = x;
        hy = y - (t.h >> 1);
        if (tm >= p.reach + p.lift + p.hold) {
          throwTank(api, p, c, d, t);
          setState(d, RECOVER);
        }
      }
    } else if (state === TOSS) {
      // the hand that caught it swings up from the catch overhead, then hurls
      const k = Math.min(8, tm);
      hx = d[CATCH_X]! + Math.trunc(((ohx - d[CATCH_X]!) * k) / 8);
      hy = d[CATCH_Y]! + Math.trunc(((ohy - d[CATCH_Y]!) * k) / 8);
      if (tm >= p.hold) {
        toss(api, p, c, d);
        setState(d, RECOVER);
      }
    } else if (state === RIP) {
      hx = Math.max(d[RIP_X0]!, Math.min(d[RIP_X1]!, c.x + d[FACE]! * p.ripReach));
      hy = d[RIP_Y0]!;
      if (rip(api, p, c, d) === 0 || tm >= p.ripTicks) setState(d, RECOVER);
    } else if (state === RECOVER) {
      hx = ohx;
      hy = ohy;
      if (tm >= p.recover) setState(d, IDLE);
    } else if (state === TOPPLE && tm === p.topple) {
      blowUp(api, p, c, d, ground);
    }

    // thrown tanks fly on whatever the monster does next
    let flying = false;
    for (const t of api.tanks) {
      const s = TANKS + t.player * SLOT;
      if (s + SLOT > d.length || d[s] !== FLY) continue;
      if (!t.alive) {
        d[s] = FREE;
        continue;
      }
      if (fly(api, p, t, d, s, 'kaiju')) {
        flying = true;
      } else {
        d[s] = FREE;
        api.emit('kaijuSlam', t.x, t.y, t.half + 4, { player: t.player });
      }
    }

    d[HAND_X] = hx;
    d[HAND_Y] = hy;
    state = d[STATE]!;
    const left = Math.max(0, d[LIFE]! - (api.turn - d[START]!));
    // one event a tick draws the monster (the renderer keeps no state of its own); gone once burst
    if (state !== TOPPLE || d[TIMER]! < p.topple)
      api.emit('kaiju', c.x, ground, p.height, {
        state,
        t: d[TIMER]!,
        rise: p.rise,
        sink: p.sink,
        topple: p.topple,
        reach: p.reach,
        face: d[FACE]!,
        hx,
        hy,
        held: d[HELD]!,
        left,
        age: d[AGE]!,
      });

    if (state === SINK) return d[TIMER]! < p.sink ? 'idle' : false;
    // toppled: the turn waits for the fall and the burst, and for the tanks it flung
    if (state === TOPPLE) return d[TIMER]! < p.topple || flying;
    const busy = flying || state === RISE || state === GRAB || state === TOSS || state === RIP;
    return busy || state === RECOVER ? true : 'idle';
  },
});

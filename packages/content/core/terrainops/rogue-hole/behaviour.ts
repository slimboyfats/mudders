import { FP, z } from '@mudders/shared';
import { defineTerrainOp, isqrt, type OpCall, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Ticks it takes to open up after landing, and to evaporate at the end. */
  rise: z.number().int().min(1).max(240),
  sink: z.number().int().min(1).max(240),
  /** How long it roams: this many full turn rotations (every tank alive when it opens, once). */
  rounds: z.number().int().min(1).max(10),
  /** Radius of the hole, cells: everything inside is eaten (ground, objects, shells). */
  core: z.number().int().min(2).max(40),
  /** Columns it drifts at the start of every turn, over `moveTicks` ticks. */
  drift: z.number().int().min(0).max(400),
  moveTicks: z.number().int().min(1).max(240),
  /** Loose cells round its rim torn in per tick while it moves. */
  suck: z.number().int().min(0).max(60),
  /** Pull on any shell (cells/tick²) near the core, 1/r out to the call's radius. */
  pull: z.number().min(0).max(4),
  /** Share of a shell's speed (per 256) soaked up per tick at the centre (see gravity well). */
  damp: z.number().int().min(0).max(64),
  /** Cells a tank in reach is dragged toward it on each move. */
  tankPull: z.number().int().min(0).max(200),
  /** Highest step (cells) a dragged tank is hauled up. */
  climb: z.number().int().min(0).max(16),
  /** A tank touching the hole is bitten every `biteEvery` ticks, at most `maxBites` per turn. */
  biteEvery: z.number().int().min(1).max(120),
  maxBites: z.number().int().min(0).max(20),
  /** Weapon that goes off on a bitten tank, and the one it pops in when it evaporates. */
  bite: z.string(),
  pop: z.string(),
});
type Params = z.infer<typeof params>;

// states
const RISE = 0;
const ROAM = 1;
const SINK = 2;

// data slots
const AGE = 0;
const STATE = 1;
const TIMER = 2;
const START = 3;
const LIFE = 4;
const X = 5;
const Y = 6;
const DIR = 7;
const TURN = 8;
const MOVE = 9;
const BITES = 10;
const EATEN = 11;
const SIZE = 12;

const EDGE = 24;
const scratchIds = new Int32Array(64);

function surface(api: SimApi, x: number): number {
  return api.grid.surfaceY(Math.max(0, Math.min(api.grid.width - 1, x)));
}

/** Eat every cell inside the hole. */
function eat(api: SimApi, cx: number, cy: number, r: number): number {
  const g = api.grid;
  const W = g.width;
  let n = 0;
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(W - 1, cx + r);
  const y0 = Math.max(0, cy - r);
  const y1 = Math.min(g.height - 2, cy + r);
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
      const dx = x - cx;
      if (dx * dx + dy * dy > r * r || g.material[i] === 0) continue;
      g.clearCell(i);
      n++;
    }
  }
  if (n > 0) g.markDirty(x0, y0, x1, y1);
  return n;
}

/** Tear loose cells off the ground round its rim and fling them into it. */
function suck(api: SimApi, p: Params, cx: number, cy: number, n: number): void {
  const g = api.grid;
  const W = g.width;
  const R = p.core * 3;
  for (let k = 0; k < n; k++) {
    const dx = api.rng.int(2 * R + 1) - R;
    const dy = api.rng.int(2 * R + 1) - R;
    const d2 = dx * dx + dy * dy;
    if (d2 <= (p.core + 1) * (p.core + 1) || d2 > R * R) continue;
    const x = cx + dx;
    const y = cy + dy;
    if (x < 0 || x >= W || y < 1 || y >= g.height - 1) continue;
    const i = y * W + x;
    // only cells with air next to them come loose
    if (g.material[i] === 0 || (g.material[i - W] !== 0 && g.material[i + W] !== 0)) continue;
    const T = 8;
    api.launch(i, Math.trunc((-dx * FP) / T), Math.trunc((-dy * FP) / T));
  }
}

function bend(api: SimApi, p: Params, c: OpCall, d: number[], cx: number, cy: number, s: number) {
  if (api.projectiles.length === 0 || s <= 0) return;
  const R16 = c.radius * 16;
  const K16 = p.core * 32;
  const core16 = p.core * 16;
  const pullFP = Math.trunc((p.pull * FP * s) / 256);
  const ox = cx * FP + (FP >> 1);
  const oy = cy * FP + (FP >> 1);
  let n = 0;
  for (const sh of api.projectiles) if (sh.alive && n < scratchIds.length) scratchIds[n++] = sh.id;
  for (let k = 0; k < n; k++) {
    const id = scratchIds[k]!;
    let shell: { x: number; y: number; vx: number; vy: number } | undefined;
    for (const sh of api.projectiles) if (sh.id === id) shell = sh;
    if (!shell) continue;
    const dx = (ox - shell.x) >> 12;
    const dy = (oy - shell.y) >> 12;
    const d2 = dx * dx + dy * dy;
    if (d2 >= R16 * R16) continue;
    const dist = Math.max(1, isqrt(d2));
    if (dist <= core16) {
      if (api.catchShell(id)) {
        d[EATEN] = d[EATEN]! + 1;
        api.emit('holeSwallow', Math.floor(shell.x / FP), Math.floor(shell.y / FP), p.core, {});
      }
      continue;
    }
    const fade = Math.min(R16 >> 2, R16 - dist);
    const a = Math.trunc((((pullFP * K16) / Math.max(dist, K16)) * fade) / (R16 >> 2));
    const damp = Math.trunc((p.damp * (R16 - dist)) / R16);
    let vx = shell.vx - Math.trunc((shell.vx * damp) / 256);
    let vy = shell.vy - Math.trunc((shell.vy * damp) / 256);
    vx += Math.trunc((a * dx) / dist);
    vy += Math.trunc((a * dy) / dist);
    api.steerShell(id, vx, vy);
  }
}

/**
 * Rogue Black Hole (weapon.rogue-hole): a black hole opens where the shell lands and roams the
 * map for `rounds` full turn rotations, a resident op. At the start of every turn it drifts
 * `drift` columns (away from whoever fired it at first, bouncing off the map edges), following
 * the lie of the land ahead and eating everything inside it: ground, objects, any shell that
 * falls in, whoever fired it. Loose ground round its rim is torn in, shells nearby are bent
 * toward it, tanks in reach are dragged toward it, and a tank it touches gets bitten (the `bite`
 * weapon goes off on it, at most `maxBites` a turn). When its time is up it evaporates in a pop.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.rogue-hole',
  version: 1,
  params,
  start(api, p, c) {
    const d = new Array<number>(SIZE).fill(0);
    let alive = 0;
    for (const t of api.tanks) if (t.alive) alive++;
    const g = api.grid;
    const x = Math.max(EDGE, Math.min(g.width - 1 - EDGE, c.x));
    d[X] = x * FP + (FP >> 1);
    d[Y] = Math.min(g.height - p.core - 2, Math.max(p.core, Math.min(c.y, surface(api, x)))) * FP;
    const owner = api.tanks[c.owner];
    d[DIR] = owner && owner.x > x ? -1 : 1;
    d[STATE] = RISE;
    d[START] = api.turn;
    d[TURN] = api.turn;
    d[LIFE] = p.rounds * Math.max(1, alive);
    d[MOVE] = 0;
    api.emit('holeOpen', x, Math.floor(d[Y] / FP), c.radius, { core: p.core });
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const c = inst.call;
    const g = api.grid;
    d[AGE] = d[AGE]! + 1;
    d[TIMER] = d[TIMER]! + 1;
    let state = d[STATE]!;
    if (state === RISE && d[TIMER]! >= p.rise) {
      state = ROAM;
      d[STATE] = ROAM;
      d[TIMER] = 0;
      d[MOVE] = p.moveTicks;
    }
    if (d[TURN] !== api.turn) {
      d[TURN] = api.turn;
      d[BITES] = 0;
      if (state === ROAM) {
        if (api.turn - d[START]! >= d[LIFE]!) {
          state = SINK;
          d[STATE] = SINK;
          d[TIMER] = 0;
          api.emit('holeClose', Math.floor(d[X]! / FP), Math.floor(d[Y]! / FP), c.radius, {
            sink: p.sink,
          });
        } else d[MOVE] = p.moveTicks;
      }
    }
    const t = d[TIMER]!;
    const s256 =
      state === RISE
        ? Math.trunc((t * 256) / p.rise)
        : state === SINK
          ? Math.max(0, 256 - Math.trunc((t * 256) / p.sink))
          : 256;
    const core = Math.max(1, Math.trunc((p.core * s256) / 256));

    // drift: along the ground ahead, bouncing off the map edges
    const moving = state === ROAM && d[MOVE]! > 0;
    if (moving) {
      d[MOVE] = d[MOVE]! - 1;
      let nx = d[X]! + d[DIR]! * Math.trunc((p.drift * FP) / p.moveTicks);
      if (nx < EDGE * FP || nx > (g.width - 1 - EDGE) * FP) {
        d[DIR] = -d[DIR]!;
        nx = Math.max(EDGE * FP, Math.min((g.width - 1 - EDGE) * FP, nx));
      }
      d[X] = nx;
      const ahead = Math.floor(nx / FP) + d[DIR]! * p.core * 2;
      const ty = Math.min(g.height - p.core - 2, surface(api, ahead)) * FP;
      d[Y] = d[Y]! + Math.max(-FP, Math.min(FP, ty - d[Y]!));
    }
    const cx = Math.floor(d[X]! / FP);
    const cy = Math.floor(d[Y]! / FP);
    c.x = cx;
    c.y = cy;

    if (state !== SINK || t < p.sink) {
      d[EATEN] = d[EATEN]! + eat(api, cx, cy, core);
      if (moving || state === RISE) suck(api, p, cx, cy, Math.trunc((p.suck * s256) / 256));
    }
    bend(api, p, c, d, cx, cy, s256);

    // tanks: dragged in while it moves, bitten when it touches them
    let biting = false;
    const every = Math.max(1, Math.trunc(p.moveTicks / Math.max(1, p.tankPull)));
    for (const tk of api.tanks) {
      if (!tk.alive) continue;
      const dx = cx - tk.x;
      const adx = dx < 0 ? -dx : dx;
      const midY = tk.y - (tk.h >> 1);
      const ady = Math.abs(cy - midY);
      if (moving && d[MOVE]! % every === 0 && adx < c.radius && adx > tk.half + core) {
        const nx = tk.x + (dx > 0 ? 1 : -1);
        const step = tk.y - surface(api, nx);
        if (tk.glue === 0 && step <= p.climb) {
          tk.x = nx;
          if (step > 0) tk.y -= step;
        }
      }
      if (state === SINK || adx > tk.half + core + 1 || ady > (tk.h >> 1) + core + 1) continue;
      if (d[BITES]! >= p.maxBites) continue;
      biting = true;
      if (t % p.biteEvery === 0) {
        const w = api.weaponByIndex(p.bite);
        if (w >= 0) {
          api.interrupt(c.owner);
          api.throwShell(w, c.owner, tk.x * FP + (FP >> 1), midY * FP, 0, 0);
          d[BITES] = d[BITES]! + 1;
          api.emit('holeBite', tk.x, midY, tk.half, { player: tk.player });
        }
      }
    }

    api.emit('rogueHole', cx, cy, c.radius, {
      state,
      t,
      age: d[AGE]!,
      core: p.core,
      strength: s256,
      dir: d[DIR]!,
      moving: moving ? 1 : 0,
    });

    if (state === SINK && t >= p.sink) {
      const w = api.weaponByIndex(p.pop);
      if (w >= 0) api.throwShell(w, c.owner, cx * FP + (FP >> 1), cy * FP, 0, 0);
      return false;
    }
    if (state === SINK) return true;
    return state === RISE || moving || biting ? true : 'idle';
  },
});

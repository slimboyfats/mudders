import { z } from '@mudders/shared';
import { FP, defineTerrainOp, type OpCall, type SimApi } from '@mudders/sim';
import { landing } from '../warp/behaviour';

const params = z.strictObject({
  /** Full turn rotations the pair stays open (turns = rounds × tanks alive when it opened). */
  rounds: z.number().int().min(1).max(10),
  /** Ring size: half its width and half its height, cells (an upright oval standing on the ground). */
  rx: z.number().int().min(3).max(40),
  ry: z.number().int().min(4).max(60),
  /** Cells from the shooter's tank (towards the shot) where the second ring opens. */
  near: z.number().int().min(10).max(200),
  /** Ticks the rings take to swirl open (the shot waits for it) and to shut. */
  open: z.number().int().min(1).max(120),
  close: z.number().int().min(1).max(120),
  /** Gap kept to another tank when a tank steps out beside the far ring. */
  gap: z.number().int().min(0).max(20).default(3),
});
type Params = z.infer<typeof params>;

// data: [age, start turn, life (turns), A x, A centre y, B x, B centre y, closing timer,
//        ...IGNORE shell ids that just came out of a ring, ...per tank: inside flags (1 = A, 2 = B)]
const AGE = 0;
const START = 1;
const LIFE = 2;
const AX = 3;
const AY = 4;
const BX = 5;
const BY = 6;
const SHUT = 7;
const IGN_AT = 8;
const IGNORE = 8;
const TANKS = IGN_AT + IGNORE;
/** Keep rings this far from the map's sides. */
const EDGE = 16;

/** First air row above ground at column x, starting the search from row y (up out of the ground, then down onto it). */
function groundAt(api: SimApi, x: number, y: number): number {
  const g = api.grid;
  let r = Math.max(0, Math.min(g.height - 1, y));
  for (let k = 0; k < 200 && r > 0 && g.material[r * g.width + x] !== 0; k++) r--;
  while (r + 1 < g.height && g.material[(r + 1) * g.width + x] === 0) r++;
  return r;
}

/** Is cell (x, y) inside the ring centred at (cx, cy), grown by `grow` cells? */
function inside(x: number, y: number, cx: number, cy: number, p: Params, grow: number): boolean {
  const rx = p.rx + grow;
  const ry = p.ry + grow;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx * ry * ry + dy * dy * rx * rx <= rx * rx * ry * ry;
}

/** Which ring a moving shell is in this tick (0 none, 1 A, 2 B): its spot and two points back along its path. */
function shellRing(d: number[], p: Params, x: number, y: number, vx: number, vy: number): number {
  for (let k = 0; k < 3; k++) {
    const sx = Math.floor((x - Math.trunc((vx * k) / 3)) / FP);
    const sy = Math.floor((y - Math.trunc((vy * k) / 3)) / FP);
    if (inside(sx, sy, d[AX]!, d[AY]!, p, 0)) return 1;
    if (inside(sx, sy, d[BX]!, d[BY]!, p, 0)) return 2;
  }
  return 0;
}

const scratch = new Int32Array(64);

/** Shells that fly into one ring come out of the other, same speed and heading. */
function passShells(api: SimApi, p: Params, d: number[]): void {
  // forget shells that came out once they are clear of both rings (or gone)
  for (let k = 0; k < IGNORE; k++) {
    const id = d[IGN_AT + k]!;
    if (id < 0) continue;
    let still = false;
    for (const s of api.projectiles) {
      if (s.id !== id || !s.alive) continue;
      const sx = Math.floor(s.x / FP);
      const sy = Math.floor(s.y / FP);
      still = inside(sx, sy, d[AX]!, d[AY]!, p, 2) || inside(sx, sy, d[BX]!, d[BY]!, p, 2);
    }
    if (!still) d[IGN_AT + k] = -1;
  }
  let n = 0;
  for (const s of api.projectiles) {
    if (!s.alive || n >= scratch.length) continue;
    let skip = false;
    for (let k = 0; k < IGNORE; k++) if (d[IGN_AT + k] === s.id) skip = true;
    if (skip) continue;
    if (shellRing(d, p, s.x, s.y, s.vx, s.vy) !== 0) scratch[n++] = s.id;
  }
  for (let k = 0; k < n; k++) {
    const id = scratch[k]!;
    let shell:
      { weapon: number; owner: number; x: number; y: number; vx: number; vy: number } | undefined;
    for (const s of api.projectiles) if (s.id === id) shell = s;
    if (!shell) continue;
    const ring = shellRing(d, p, shell.x, shell.y, shell.vx, shell.vy);
    if (ring === 0) continue;
    const [fx, fy, tx, ty] =
      ring === 1 ? [d[AX]!, d[AY]!, d[BX]!, d[BY]!] : [d[BX]!, d[BY]!, d[AX]!, d[AY]!];
    const { weapon, owner, vx, vy } = shell;
    // it keeps its place across the ring, mirrored onto the far one
    const ox = Math.max(-p.rx, Math.min(p.rx, Math.floor(shell.x / FP) - fx));
    const oy = Math.max(-p.ry, Math.min(p.ry, Math.floor(shell.y / FP) - fy));
    if (!api.catchShell(id)) continue;
    const out = api.throwShell(weapon, owner, (tx + ox) * FP + FP / 2, (ty + oy) * FP, vx, vy);
    if (out >= 0) {
      let slot = 0;
      for (let j = 0; j < IGNORE; j++) if (d[IGN_AT + j]! < 0) slot = j;
      d[IGN_AT + slot] = out;
    }
    api.emit('portalPass', fx + ox, fy + oy, 4, { tx: tx + ox, ty: ty + oy });
  }
}

/** Tanks that drive, fall or get thrown into one ring step out beside the other. */
function passTanks(api: SimApi, p: Params, d: number[]): void {
  for (const t of api.tanks) {
    const b = TANKS + t.player;
    if (b >= d.length) continue;
    if (!t.alive) {
      d[b] = 0;
      continue;
    }
    const cy = t.y - (t.h >> 1);
    const inA = inside(t.x, cy, d[AX]!, d[AY]!, p, t.half >> 1);
    const inB = inside(t.x, cy, d[BX]!, d[BY]!, p, t.half >> 1);
    const was = d[b]!;
    const now = (inA ? 1 : 0) | (inB ? 2 : 0);
    d[b] = now;
    const entered = inA && !(was & 1) ? 1 : inB && !(was & 2) ? 2 : 0;
    if (entered === 0 || t.glue > 0) continue;
    const [fx, tx, ty] = entered === 1 ? [d[AX]!, d[BX]!, d[BY]!] : [d[BX]!, d[AX]!, d[AY]!];
    // it carries on the way it was going: came in from the left, steps out on the right
    const dir = t.x <= fx ? 1 : -1;
    const side = tx + dir * (p.rx + t.half + 2);
    const [x, y] = landing(api, t, side, ty + p.ry, tx, p.gap, -1);
    api.emit('portalPass', t.x, cy, t.half, { tx: x, ty: y - (t.h >> 1), player: t.player });
    api.hold(t.player, x, y, y);
    d[b] = 0;
  }
}

/** Where the near ring opens: `near` cells from the shooter towards the shot, on the ground there. */
function nearSpot(api: SimApi, p: Params, c: OpCall, ax: number): [number, number] {
  const g = api.grid;
  const me = api.tanks[c.owner];
  const ox = me ? me.x : ax;
  const oy = me ? me.y : c.y;
  const dir = ax >= ox ? 1 : -1;
  let bx = Math.max(EDGE, Math.min(g.width - 1 - EDGE, ox + dir * p.near));
  // too close to the far ring: open on the other side of the tank instead
  if (Math.abs(bx - ax) < 2 * p.rx + 8)
    bx = Math.max(EDGE, Math.min(g.width - 1 - EDGE, ox - dir * p.near));
  return [bx, groundAt(api, bx, oy - 1)];
}

/**
 * Portal Pair (weapon.portal-pair): two linked rings open, one where the shell lands and its twin
 * a short way in front of the shooter. Any shell that flies into one comes out of the other at
 * the same speed and heading; any tank that drives, falls or is thrown into one steps out beside
 * the other, going the same way. They stay open for `rounds` full turn rotations, then shut. They
 * work for everyone, the shooter included. A resident op: it doesn't hold up the turns.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.portal',
  version: 1,
  params,
  start(api, p, c) {
    const g = api.grid;
    const ax = Math.max(EDGE, Math.min(g.width - 1 - EDGE, c.x));
    const ag = groundAt(api, ax, c.y);
    const [bx, bg] = nearSpot(api, p, c, ax);
    let alive = 0;
    for (const t of api.tanks) if (t.alive) alive++;
    const d = new Array<number>(TANKS + api.tanks.length).fill(0);
    d[START] = api.turn;
    d[LIFE] = p.rounds * Math.max(1, alive);
    d[AX] = ax;
    d[AY] = ag - p.ry;
    d[BX] = bx;
    d[BY] = bg - p.ry;
    d[SHUT] = -1;
    for (let k = 0; k < IGNORE; k++) d[IGN_AT + k] = -1;
    // tanks already standing in a ring when it opens don't go through until they step out and back in
    for (const t of api.tanks) {
      const cy = t.y - (t.h >> 1);
      d[TANKS + t.player] =
        (inside(t.x, cy, d[AX]!, d[AY]!, p, t.half >> 1) ? 1 : 0) |
        (inside(t.x, cy, d[BX]!, d[BY]!, p, t.half >> 1) ? 2 : 0);
    }
    api.emit('portalOpen', ax, d[AY]!, p.ry, { bx, by: d[BY]!, rx: p.rx });
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const age = d[AGE]!;
    d[AGE] = age + 1;
    const left = Math.max(0, d[LIFE]! - (api.turn - d[START]!));
    if (d[SHUT]! < 0 && left <= 0) {
      d[SHUT] = 0;
      api.emit('portalClose', d[AX]!, d[AY]!, p.ry, { bx: d[BX]!, by: d[BY]! });
    }
    const shut = d[SHUT]!;
    if (shut < 0 && age >= p.open) {
      passShells(api, p, d);
      passTanks(api, p, d);
    }
    // one event a tick draws both rings (the renderer keeps no state of its own)
    api.emit('portal', d[AX]!, d[AY]!, p.ry, {
      bx: d[BX]!,
      by: d[BY]!,
      rx: p.rx,
      age,
      open: p.open,
      shut,
      close: p.close,
      left,
    });
    if (shut >= 0) {
      d[SHUT] = shut + 1;
      return shut + 1 < p.close ? 'idle' : false;
    }
    return age < p.open ? true : 'idle';
  },
});

import type { EffectEvent, RenderSnapshot } from '@mudders/shared';
import type { QuadBatch } from './batch';
import { litColor } from './lighting';
import { PKind, type ParticleSink } from './particles';

/**
 * Wildlife (§2a living world): rabbits on the ground and fish in the lakes. Cosmetic, so it lives
 * in the renderer, but it is stepped once per snapshot tick from a seed taken from the map, so two
 * clients watching the same match see the same animals do the same things.
 *
 * Rabbits graze, hop about, freeze and bolt from blasts, from a shell coming down near them and
 * from a tank driving up, and dive into a burrow once they have run far enough, popping out again
 * later. A close blast throws them; one right on them turns them into a puff of black pixels. Fish
 * swim in the lakes, now and then leap out in an arc and splash back; a blast in or beside the
 * water stuns them and they float up belly-up and drift on the surface. All drawn cell by cell.
 */

export interface CritterProbe {
  width: number;
  height: number;
  /** Terrain or liquid in the cell. */
  solid(x: number, y: number): boolean;
  liquid(x: number, y: number): boolean;
}

type Light = (x: number, y: number) => readonly [number, number, number];

const R = { Graze: 0, Hop: 1, Flee: 2, Flung: 3, Burrow: 4, Hidden: 5 } as const;
type R = (typeof R)[keyof typeof R];

const F = { Swim: 0, Leap: 1, Dead: 2, Flop: 3 } as const;
type F = (typeof F)[keyof typeof F];

export interface Rabbit {
  x: number;
  /** Row of the ground cell under its feet. */
  y: number;
  vx: number;
  vy: number;
  dir: -1 | 1;
  state: R;
  /** Tick the current state ends (graze, flee, hidden) or started (burrow). */
  until: number;
  /** Hop phase in ticks, for the bounce. */
  phase: number;
}

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: -1 | 1;
  state: F;
  until: number;
  /** Lowest and highest row it keeps to while swimming (its lake's surface and floor). */
  top: number;
}

/** Small seeded generator (mulberry32): cosmetic, but the same for every client. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
}

/** Ground and lake sizes per animal. */
const CELLS_PER_RABBIT = 140;
const MAX_RABBITS = 10;
const MAX_FISH = 14;
/** Tallest step a rabbit hops up, and the drop it will hop down without a second thought. */
const STEP_UP = 4;
const STEP_DOWN = 8;
const GRAVITY = 0.16;
/** Speeds in cells per tick. */
const HOP_SPEED = 0.32;
const FLEE_SPEED = 1.05;
const SWIM_SPEED = 0.14;
/** Shells this close (cells) send rabbits running; tanks this close make them hop off. */
const SHELL_FEAR = 80;
const TANK_FEAR = 22;

/** First solid (terrain or liquid) row at or below `y0` in column x, or -1. */
function groundBelow(p: CritterProbe, x: number, y0: number): number {
  for (let y = Math.max(0, y0); y < p.height; y++) if (p.solid(x, y)) return y;
  return -1;
}

/** Top surface row of column x (first solid from the sky), or -1. */
function surface(p: CritterProbe, x: number): number {
  return groundBelow(p, x, 0);
}

/** A seed from the map's skyline and the round, the same on every client. */
export function mapSeed(terrain: Uint8Array, w: number, h: number, round: number): number {
  let seed = Math.imul(round + 1, 0x9e3779b1) ^ w;
  for (let x = 0; x < w; x += 7) {
    let y = 0;
    while (y < h && terrain[y * w + x] === 0) y++;
    seed = Math.imul(seed ^ y, 0x85ebca6b) >>> 0;
  }
  return seed;
}

export class Critters {
  readonly rabbits: Rabbit[] = [];
  readonly fish: Fish[] = [];
  private rng = new Rng(1);
  private lastTick = -1;

  /**
   * New map: scatter rabbits over dry open ground, clear of the tanks, and fish into the lakes.
   * The seed comes from the map itself, so every client places the same animals.
   */
  populate(p: CritterProbe, tankXs: readonly number[], seed: number): void {
    this.rabbits.length = 0;
    this.fish.length = 0;
    const rng = new Rng(seed);
    this.rng = new Rng(seed ^ 0x5bd1e995);
    const w = p.width;
    const want = Math.max(3, Math.min(MAX_RABBITS, Math.floor(w / CELLS_PER_RABBIT)));
    for (let tries = 0; tries < want * 12 && this.rabbits.length < want; tries++) {
      const x = rng.int(16, w - 17);
      const y = surface(p, x);
      if (y < 8 || p.liquid(x, y)) continue;
      if (tankXs.some((tx) => Math.abs(tx - x) < 45)) continue;
      if (this.rabbits.some((r) => Math.abs(r.x - x) < 30)) continue;
      // gentle ground only: no cliff faces
      if (Math.abs(surface(p, x - 3) - y) > 3 || Math.abs(surface(p, x + 3) - y) > 3) continue;
      this.rabbits.push({
        x: x + 0.5,
        y,
        vx: 0,
        vy: 0,
        dir: rng.next() < 0.5 ? -1 : 1,
        state: R.Graze,
        until: rng.int(30, 400),
        phase: 0,
      });
    }
    for (let tries = 0; tries < 200 && this.fish.length < MAX_FISH; tries++) {
      const x = rng.int(4, w - 5);
      const top = surface(p, x);
      if (top < 0 || !p.liquid(x, top)) continue;
      let depth = 0;
      while (top + depth < p.height && p.liquid(x, top + depth)) depth++;
      if (depth < 7) continue;
      if (this.fish.some((f) => Math.abs(f.x - x) < 24)) continue;
      this.fish.push({
        x: x + 0.5,
        y: top + rng.int(3, depth - 3),
        vx: 0,
        vy: 0,
        dir: rng.next() < 0.5 ? -1 : 1,
        state: F.Swim,
        until: rng.int(200, 1400),
        top,
      });
    }
  }

  /** One snapshot tick: react to blasts, shells and tanks, then move. */
  step(s: RenderSnapshot, p: CritterProbe, sink: ParticleSink): void {
    if (s.tick === this.lastTick) return;
    this.lastTick = s.tick;
    const t = s.tick;
    for (const e of s.effectEvents) {
      if (e.type === 'burst' || e.type === 'flash' || e.type === 'nukeBlast') {
        if (e.radius > 0) this.blast(e, t, sink, p);
      }
    }
    for (const e of s.entities) {
      if (e.kind === 'projectile') {
        for (const r of this.rabbits) {
          if (r.state === R.Hidden || r.state === R.Flung) continue;
          const dx = r.x - e.x;
          if (Math.abs(dx) < SHELL_FEAR && Math.abs(r.y - e.y) < SHELL_FEAR * 1.5 && e.y < r.y) {
            this.scare(r, dx >= 0 ? 1 : -1, t, 90);
          }
        }
      } else if (e.kind === 'tank' && e.alive) {
        for (const r of this.rabbits) {
          if (r.state !== R.Graze && r.state !== R.Hop) continue;
          const dx = r.x - e.x;
          if (Math.abs(dx) < TANK_FEAR && Math.abs(r.y - e.y) < 16) {
            this.scare(r, dx >= 0 ? 1 : -1, t, 50);
          }
        }
      }
    }
    for (const r of this.rabbits) this.moveRabbit(r, p, t);
    for (const f of this.fish) this.moveFish(f, p, t, sink);
  }

  private scare(r: Rabbit, dir: -1 | 1, t: number, ticks: number): void {
    if (r.state === R.Burrow) return;
    if (r.state !== R.Flee) r.phase = 0;
    r.state = R.Flee;
    r.dir = dir;
    r.until = Math.max(r.until, t + ticks + this.rng.int(0, 60));
  }

  private blast(e: EffectEvent, t: number, sink: ParticleSink, p: CritterProbe): void {
    const rad = e.radius;
    for (let i = this.rabbits.length - 1; i >= 0; i--) {
      const r = this.rabbits[i]!;
      if (r.state === R.Hidden) continue;
      const dx = r.x - e.x;
      const dy = r.y - 2 - e.y;
      const d = Math.hypot(dx, dy);
      const dir: -1 | 1 = dx >= 0 ? 1 : -1;
      if (d < rad + 3) {
        pulp(sink, r.x, r.y - 2, dx, dy, d, t);
        this.rabbits.splice(i, 1);
      } else if (d < rad * 2.2 + 8) {
        const k = 1 - (d - rad) / (rad * 1.2 + 8);
        r.state = R.Flung;
        r.dir = dir;
        r.vx = dir * (0.8 + 1.6 * k);
        r.vy = -(1.2 + 2.2 * k) + (dy > 0 ? 0 : 0.6);
        r.y -= 1;
      } else if (d < rad * 6 + 60) {
        this.scare(r, dir, t, 160);
      }
    }
    for (const f of this.fish) {
      if (f.state === F.Dead) continue;
      const d = Math.hypot(f.x - e.x, f.y - e.y);
      // water carries a shock a long way
      if (d < rad * 2.5 + 14) {
        f.state = F.Dead;
        f.vx = 0;
        f.vy = -0.3;
        f.until = t;
      } else if (d < rad * 6 + 50 && f.state === F.Swim) {
        f.dir = f.x >= e.x ? 1 : -1;
        f.until = Math.max(f.until, t + 120);
      }
    }
    void p;
  }

  private moveRabbit(r: Rabbit, p: CritterProbe, t: number): void {
    const xi = Math.floor(r.x);
    switch (r.state) {
      case R.Hidden: {
        if (t < r.until) return;
        // pops out of a burrow nearby, once the coast is clear
        const nx = Math.max(12, Math.min(p.width - 13, xi + this.rng.int(-30, 30)));
        const ny = surface(p, nx);
        if (ny < 0 || p.liquid(nx, ny)) {
          r.until = t + 120;
          return;
        }
        r.x = nx + 0.5;
        r.y = ny;
        r.state = R.Burrow;
        r.until = -t; // negative: coming out
        return;
      }
      case R.Burrow: {
        const out = r.until < 0;
        const age = out ? t + r.until : t - r.until;
        if (age >= 12) {
          if (out) {
            r.state = R.Graze;
            r.until = t + this.rng.int(60, 300);
          } else {
            r.state = R.Hidden;
            r.until = t + this.rng.int(600, 1800);
          }
        }
        return;
      }
      case R.Flung: {
        r.vy += GRAVITY;
        const nx = r.x + r.vx;
        const nxi = Math.floor(nx);
        if (nxi < 1 || nxi >= p.width - 1) r.vx = -r.vx * 0.4;
        else if (!p.solid(nxi, Math.floor(r.y) - 1)) r.x = nx;
        else r.vx = -r.vx * 0.3;
        const ny = r.y + r.vy;
        const g = groundBelow(p, Math.floor(r.x), Math.floor(r.y));
        if (r.vy > 0 && g >= 0 && ny >= g) {
          r.y = g;
          r.vx = 0;
          r.vy = 0;
          this.scare(r, r.dir, t, 140);
        } else {
          r.y = ny;
          if (r.y > p.height + 20) r.state = R.Hidden;
        }
        return;
      }
      default:
        break;
    }
    // on the ground: fall if it was dug out from under it, climb out if buried
    let g = groundBelow(p, xi, Math.floor(r.y) - 1);
    if (g < 0) {
      r.state = R.Hidden;
      r.until = Number.MAX_SAFE_INTEGER;
      return;
    }
    if (g === Math.floor(r.y) - 1) {
      // buried: dig up through what landed on it
      let up = 0;
      while (up < 40 && p.solid(xi, Math.floor(r.y) - 1 - up)) up++;
      g = Math.floor(r.y) - up;
    }
    if (g > r.y + 1) {
      // falling
      r.vy += GRAVITY;
      r.y = Math.min(g, r.y + r.vy);
      return;
    }
    r.y = g;
    r.vy = 0;

    if (r.state === R.Graze) {
      if (t < r.until) return;
      r.state = R.Hop;
      r.phase = 0;
      if (this.rng.next() < 0.4) r.dir = r.dir === 1 ? -1 : 1;
      r.until = t + this.rng.int(20, 90);
      return;
    }
    const fleeing = r.state === R.Flee;
    if (fleeing && t >= r.until) {
      // far enough: half of them dive into a burrow, the rest go back to grazing
      if (this.rng.next() < 0.5 && !p.liquid(xi, Math.floor(r.y))) {
        r.state = R.Burrow;
        r.until = t;
      } else {
        r.state = R.Graze;
        r.until = t + this.rng.int(60, 240);
      }
      return;
    }
    if (!fleeing && t >= r.until) {
      r.state = R.Graze;
      r.until = t + this.rng.int(90, 500);
      return;
    }
    r.phase++;
    const speed = fleeing ? FLEE_SPEED : HOP_SPEED;
    const nx = r.x + r.dir * speed;
    const nxi = Math.floor(nx);
    if (nxi < 8 || nxi >= p.width - 8) {
      r.dir = r.dir === 1 ? -1 : 1;
      return;
    }
    if (nxi === xi) {
      r.x = nx;
      return;
    }
    const ng = groundBelow(p, nxi, Math.floor(r.y) - STEP_UP);
    const wall = p.solid(nxi, Math.floor(r.y) - STEP_UP - 1) || ng < 0;
    const wet = ng >= 0 && p.liquid(nxi, ng) && !p.liquid(xi, Math.floor(r.y));
    const cliff = ng - r.y > (fleeing ? STEP_DOWN * 3 : STEP_DOWN);
    if (wall || wet || cliff) {
      r.dir = r.dir === 1 ? -1 : 1;
      return;
    }
    r.x = nx;
  }

  private moveFish(f: Fish, p: CritterProbe, t: number, sink: ParticleSink): void {
    const xi = Math.floor(f.x);
    const yi = Math.floor(f.y);
    const wet = p.liquid(xi, yi);
    switch (f.state) {
      case F.Dead: {
        // belly up, it floats to the surface and drifts there; on dry ground it just lies
        if (wet) {
          if (p.liquid(xi, yi - 1)) f.y -= 0.25;
          else f.y = yi;
          f.x += Math.sin(t * 0.01 + f.top) * 0.03;
        } else if (!p.solid(xi, yi + 1)) {
          f.y += 0.6;
        }
        return;
      }
      case F.Flop: {
        if (wet) {
          f.state = F.Swim;
          return;
        }
        if (!p.solid(xi, yi + 1)) f.y += 0.6;
        if (t >= f.until) f.state = F.Dead;
        return;
      }
      case F.Leap: {
        f.vy += 0.11;
        f.x += f.vx;
        f.y += f.vy;
        const nyi = Math.floor(f.y);
        if (f.vy > 0 && p.solid(Math.floor(f.x), nyi)) {
          if (p.liquid(Math.floor(f.x), nyi)) {
            splash(sink, f.x, nyi, t);
            f.state = F.Swim;
            f.vy = 0;
            f.y = nyi + 2;
            f.until = t + this.rng.int(500, 2000);
          } else {
            f.state = F.Flop;
            f.y = nyi - 1;
            f.until = t + 240;
          }
        }
        return;
      }
      default:
        break;
    }
    if (!wet) {
      // its water drained away (a blast, a crater lip giving way)
      f.state = F.Flop;
      f.until = t + 240;
      return;
    }
    // find the surface over it, so it knows how high it may swim
    let top = yi;
    while (top > 0 && p.liquid(xi, top - 1)) top--;
    f.top = top;
    if (t >= f.until && yi - top < 10) {
      // leap: rise to just under the surface and jump out
      if (yi > top + 1) {
        f.y -= 0.35;
        f.x += f.dir * SWIM_SPEED;
        return;
      }
      splash(sink, f.x, top, t);
      f.state = F.Leap;
      f.vx = f.dir * this.rng.range(0.35, 0.7);
      f.vy = -this.rng.range(1.3, 2.1);
      f.y = top - 1;
      return;
    }
    if (t >= f.until) f.until = t + this.rng.int(200, 900);
    const nx = f.x + f.dir * SWIM_SPEED;
    // a slow up and down wander, kept inside the water
    const ny = f.y + Math.sin(t * 0.03 + f.x * 0.1) * 0.06;
    if (!p.liquid(Math.floor(nx), yi) || !p.liquid(Math.floor(nx + f.dir * 3), yi)) {
      f.dir = f.dir === 1 ? -1 : 1;
    } else {
      f.x = nx;
    }
    if (p.liquid(xi, Math.floor(ny)) && Math.floor(ny) > top) f.y = ny;
  }
}

const SOOT = [0x08090d, 0x100c0a, 0x1a1410, 0x2a1e16] as const;
const FUR = 0xa88660;

function pulp(
  sink: ParticleSink,
  x: number,
  y: number,
  dx: number,
  dy: number,
  d: number,
  t: number,
): void {
  const r = new Rng(Math.imul(t + 1, 0x9e3779b1) ^ Math.imul(Math.floor(x) + 7, 0x85ebca6b));
  const n = Math.max(1, d);
  for (let k = 0; k < 16; k++) {
    sink.add({
      x: x + r.range(-1.5, 1.5),
      y: y + r.range(-1, 1),
      vx: (dx / n) * r.range(0.6, 2.2) + r.range(-0.9, 0.9),
      vy: (dy / n) * r.range(0.6, 2) - r.range(0.6, 1.8),
      life: r.range(90, 200),
      size: 1,
      color: k % 5 === 0 ? FUR : SOOT[k % SOOT.length]!,
      kind: PKind.Chunk,
    });
  }
}

const SPRAY = [0xe8f4ff, 0xb8d8f0, 0x7fb0d8] as const;

function splash(sink: ParticleSink, x: number, y: number, t: number): void {
  const r = new Rng(Math.imul(t + 3, 0x85ebca6b) ^ Math.imul(Math.floor(x) + 1, 0x9e3779b1));
  for (let k = 0; k < 7; k++) {
    sink.add({
      x: x + r.range(-1, 1),
      y: y - 0.5,
      vx: r.range(-0.5, 0.5),
      vy: -r.range(0.5, 1.3),
      life: r.range(30, 60),
      size: 1,
      color: SPRAY[k % SPRAY.length]!,
      kind: PKind.Chunk,
    });
  }
}

/**
 * Rabbit cells facing right, top row first, bottom row standing on the ground row above `y`:
 * e ear, b back, h head, k eye, t tail, l leg. Sit (grazing, ears up), and two hop frames.
 */
const SIT = ['...e.', '...ee', '.bbhk', 'tbbhh', '.l.l.'] as const;
const CROUCH = ['.....', '....e', '.bbee', 'tbbhk', 'lb.hh'] as const;
const LEAP = ['.....', '....e', 'bbbee', 'tbbhk', 'l...l'] as const;
const DUSK = ['.....', '.....', '.....', 'tbbee', '.bbhk'] as const;
const DOWN = ['.....', '.....', '.....', '.....', 'tbbhk'] as const;

const RABBIT_RGB: Record<string, number> = {
  e: 0x7a5a3c,
  b: FUR,
  h: 0xbc9a72,
  k: 0x140e0a,
  t: 0xe8e0d0,
  l: 0x6e5238,
};

function rabbitRows(r: Rabbit, t: number): { rows: readonly string[]; lift: number } {
  switch (r.state) {
    case R.Hidden:
      return { rows: [], lift: 0 };
    case R.Burrow: {
      const out = r.until < 0;
      const age = out ? t + r.until : t - r.until;
      const k = out ? 12 - age : age;
      return { rows: k < 4 ? CROUCH : k < 8 ? DUSK : DOWN, lift: 0 };
    }
    case R.Flung:
      return { rows: LEAP, lift: 0 };
    case R.Graze: {
      // nibbles: head dips in and out
      const nib = Math.floor((t + r.x * 7) / 40) % 3 === 0;
      return { rows: nib ? CROUCH : SIT, lift: 0 };
    }
    default: {
      const cycle = r.state === R.Flee ? 8 : 14;
      const ph = r.phase % cycle;
      const air = ph < cycle / 2;
      const peak = r.state === R.Flee ? 3 : 2;
      const lift = air ? Math.round(Math.sin((ph / (cycle / 2)) * Math.PI) * peak) : 0;
      return { rows: air ? LEAP : CROUCH, lift };
    }
  }
}

export function drawRabbits(b: QuadBatch, c: Critters, t: number, light: Light): void {
  for (const r of c.rabbits) {
    const { rows, lift } = rabbitRows(r, t);
    if (rows.length === 0) continue;
    const x0 = Math.floor(r.x) - 2;
    const y0 = Math.round(r.y) - rows.length - lift;
    const l = light(r.x, r.y - 2);
    for (let row = 0; row < rows.length; row++) {
      const s = rows[row]!;
      for (let col = 0; col < 5; col++) {
        const ch = s[col]!;
        if (ch === '.') continue;
        const cx = r.dir === 1 ? x0 + col : x0 + 4 - col;
        b.rect(cx, y0 + row, 1, 1, litColor(RABBIT_RGB[ch] ?? FUR, l));
      }
    }
  }
}

/** Fish cells facing right: back on top, belly below, tail on the left. */
const FISH_BACK = 0x4a6a7c;
const FISH_BELLY = 0xc8d8e0;
const FISH_TAIL = 0x3a5464;
const DEAD_BELLY = 0xe8ecef;
const DEAD_BACK = 0x8a9aa4;

export function drawFish(b: QuadBatch, c: Critters, t: number, light: Light): void {
  for (const f of c.fish) {
    const x = Math.floor(f.x);
    const y = Math.floor(f.y);
    const l = light(x, y);
    const d = f.dir;
    if (f.state === F.Dead) {
      // belly up: pale side on top
      b.rect(x - 1, y - 1, 3, 1, litColor(DEAD_BELLY, l));
      b.rect(x - 1, y, 3, 1, litColor(DEAD_BACK, l));
      b.rect(x - 2 * d, y - 1, 1, 1, litColor(DEAD_BACK, l));
      continue;
    }
    // a flopping fish flips over every few ticks
    const flip = f.state === F.Flop && Math.floor(t / 6) % 2 === 0;
    const top = flip ? FISH_BELLY : FISH_BACK;
    const bot = flip ? FISH_BACK : FISH_BELLY;
    // a leaping fish tilts with its arc: nose up on the way up, down on the way down
    const tilt = f.state === F.Leap ? (f.vy < -0.4 ? -1 : f.vy > 0.4 ? 1 : 0) : 0;
    b.rect(x - 1, y - 1, 3, 1, litColor(top, l));
    b.rect(x - 1, y, 3, 1, litColor(bot, l));
    b.rect(x + 2 * d, y - 1 + (tilt > 0 ? 1 : 0), 1, 1, litColor(top, l));
    // tail fin, wagging
    const wag = Math.floor(t / 8 + f.x) % 2 === 0 ? -1 : 0;
    b.rect(x - 2 * d, y + wag + (tilt < 0 ? 1 : 0), 1, 1, litColor(FISH_TAIL, l));
  }
}

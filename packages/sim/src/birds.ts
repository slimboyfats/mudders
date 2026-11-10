import { FP } from '@mudders/shared';
import { cosDeci, isqrt, sinDeci } from './fixed';
import type { Hasher } from './hash';
import { Prng } from './prng';

/**
 * Swallows (§2a living world, kernel 0.35.0): small flocks that wheel over the map, ride the wind,
 * scatter from shots and blasts, and are part of the deterministic state because a shell that hits
 * one goes off right there. A blast's pressure front tears apart every bird it reaches.
 *
 * Fixed-point (positions and velocities in FP per cell), integer math with the table trig, own
 * PRNG (seeded from the match seed and the round) so turning birds on never shifts the match RNG.
 * Fixed-size typed arrays, removal by flag: no allocation per tick. Only stepped while
 * `MatchRules.birds` is on; off (the default for scenarios and tests), nothing here runs and
 * nothing is hashed.
 */

const CAP = 48;
const FLOCKS = 4;
/** Cells per tick a pressure front travels (the world's `PRESSURE_SPEED`). */
const FRONT_SPEED = 6;
/** Sub-cell unit used for distances (1/256 cell), so squares stay well inside 2^53. */
const SUB = 256;
const toSub = (v: number): number => Math.trunc(v / (FP / SUB));
/** A shell this close (cells) to a bird hits it. */
const HIT_R = 2;
/** A shell passing this close (cells) frightens a bird. */
const NEAR_R = 14;

export interface BirdWorld {
  readonly width: number;
  readonly height: number;
  solid(x: number, y: number): boolean;
  emit(type: string, x: number, y: number, radius: number, params?: Record<string, number>): void;
}

export class Flocks {
  readonly x = new Int32Array(CAP);
  readonly y = new Int32Array(CAP);
  readonly vx = new Int32Array(CAP);
  readonly vy = new Int32Array(CAP);
  /** Formation offset (FP) from the flock's lead point, along and across its heading. */
  private readonly ox = new Int32Array(CAP);
  private readonly oy = new Int32Array(CAP);
  /** Flock index, -1 = free slot. */
  readonly flock = new Int8Array(CAP).fill(-1);
  /** Ticks left fleeing. */
  readonly panic = new Int16Array(CAP);
  /** Tick a pressure front reaches the bird (-1 = none), the blast's cell and its closeness ‰. */
  private readonly doom = new Int32Array(CAP).fill(-1);
  private readonly doomX = new Int32Array(CAP);
  private readonly doomY = new Int32Array(CAP);
  private readonly doomK = new Int32Array(CAP);
  /** Lead points: position (FP), heading (deci-degrees, y down), turn rate, boost ‰. */
  private readonly lx = new Int32Array(FLOCKS);
  private readonly ly = new Int32Array(FLOCKS);
  private readonly lh = new Int32Array(FLOCKS);
  private readonly lt = new Int32Array(FLOCKS);
  private readonly lb = new Int32Array(FLOCKS);
  private rng = new Prng(1);
  private W = 0;
  private H = 0;
  private flocks = 0;
  private want = 0;
  private nextFlock = 0;
  /** Birds killed by shells and by blasts (tests). */
  hits = 0;
  pulped = 0;

  get alive(): number {
    let n = 0;
    for (let i = 0; i < CAP; i++) if (this.flock[i]! >= 0) n++;
    return n;
  }

  /** A new round's map: fresh flocks in its open sky. */
  reset(w: BirdWorld, seed: number, round: number, tick: number): void {
    this.flock.fill(-1);
    this.doom.fill(-1);
    this.panic.fill(0);
    this.W = w.width;
    this.H = w.height;
    this.rng = new Prng((seed ^ 0x5b1fd ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0);
    this.flocks = Math.max(1, Math.min(FLOCKS - 1, Math.trunc((w.width + 260) / 520)));
    this.want = Math.max(6, Math.min(CAP, Math.trunc((w.width * 20) / 1000)));
    const per = Math.ceil(this.want / this.flocks);
    for (let f = 0; f < this.flocks; f++) {
      const x = Math.trunc(((f * 1000 + 250 + this.rng.int(500)) * this.W) / (1000 * this.flocks));
      this.spawnFlock(w, f, x, this.rng.int(2) === 0 ? 0 : 1800, per);
    }
    this.nextFlock = tick + 600;
  }

  /** Top of the ground in column `x` (cells; the map height if open all the way down). */
  private ground(w: BirdWorld, x: number): number {
    const cx = Math.max(0, Math.min(this.W - 1, x));
    for (let y = 0; y < this.H; y += 2) if (w.solid(cx, y)) return y;
    return this.H;
  }

  /** Cruising height (cells) over column `x`: well clear of the ground, a little below the top. */
  private cruise(w: BirdWorld, x: number, f: number): number {
    const g = this.ground(w, x);
    const k = 350 + Math.trunc((150 * sinDeci(f * 1203)) / FP);
    return Math.max(8, Math.min(g - 26, Math.trunc((g * k) / 1000)));
  }

  private spawnFlock(w: BirdWorld, f: number, x: number, heading: number, n: number): void {
    const y = this.cruise(w, x, f);
    if (y < 8) return; // no open sky here (a cave roof)
    this.lx[f] = x * FP;
    this.ly[f] = y * FP;
    this.lh[f] = heading;
    this.lt[f] = 0;
    this.lb[f] = 0;
    const c = cosDeci(heading);
    let made = 0;
    for (let i = 0; i < CAP && made < n; i++) {
      if (this.flock[i]! >= 0) continue;
      // a loose wedge trailing the lead point
      const back = 3 * FP + Math.trunc((made * 12 * FP) / 5) + this.rng.int(3 * FP);
      const side =
        (made & 1 ? 1 : -1) * (FP + Math.trunc((made * 13 * FP) / 10)) +
        this.rng.range(-2 * FP, 2 * FP);
      this.ox[i] = -back;
      this.oy[i] = side;
      this.x[i] = x * FP - Math.trunc((c * back) / FP);
      this.y[i] = y * FP + side;
      this.vx[i] = c;
      this.vy[i] = 0;
      this.flock[i] = f;
      this.panic[i] = 0;
      this.doom[i] = -1;
      made++;
    }
  }

  /**
   * A blast at cell (x, y): birds within `reach` cells are torn apart when its pressure front gets
   * there, birds within `scare` scatter.
   */
  blast(x: number, y: number, reach: number, scare: number, tick: number): void {
    if (this.W === 0) return;
    for (let i = 0; i < CAP; i++) {
      if (this.flock[i]! < 0) continue;
      const dx = toSub(this.x[i]!) - x * SUB;
      const dy = toSub(this.y[i]!) - y * SUB;
      const d = Math.trunc(isqrt(dx * dx + dy * dy) / SUB);
      if (d < reach) {
        const at = tick + Math.trunc(d / FRONT_SPEED);
        if (this.doom[i]! < 0 || at < this.doom[i]!) {
          this.doom[i] = at;
          this.doomX[i] = x;
          this.doomY[i] = y;
          this.doomK[i] = 1000 - Math.trunc((d * 1000) / Math.max(1, reach));
        }
      } else if (d < scare) {
        this.scare(i, x, y, 70 + Math.trunc((60 * (scare - d)) / scare));
      }
    }
  }

  /** A gunshot or a bird hit: birds within `r` cells of (x, y) flee. */
  startle(x: number, y: number, r: number): void {
    const r2 = r * SUB * (r * SUB);
    for (let i = 0; i < CAP; i++) {
      if (this.flock[i]! < 0) continue;
      const dx = toSub(this.x[i]!) - x * SUB;
      const dy = toSub(this.y[i]!) - y * SUB;
      if (dx * dx + dy * dy < r2) this.scare(i, x, y, 50);
    }
  }

  /** Flee from cell (x, y), and upward. The flock's lead point bolts the same way. */
  private scare(i: number, x: number, y: number, ticks: number): void {
    const dx = toSub(this.x[i]!) - x * SUB;
    const dy = toSub(this.y[i]!) - y * SUB - 6 * SUB;
    const d = Math.max(SUB, isqrt(dx * dx + dy * dy));
    const sp = Math.trunc((22 * FP) / 10);
    this.vx[i] = Math.trunc((this.vx[i]! * 3) / 10) + Math.trunc((dx * sp) / d);
    this.vy[i] = Math.trunc((this.vy[i]! * 3) / 10) + Math.trunc((dy * sp) / d);
    if (ticks > this.panic[i]!) this.panic[i] = ticks;
    const f = this.flock[i]!;
    // point the lead the way the bird fled: the nearest of 16 headings
    let best = 0;
    let bestDot = -Infinity;
    for (let a = 0; a < 3600; a += 225) {
      const dot = cosDeci(a) * dx + sinDeci(a) * dy;
      if (dot > bestDot) {
        bestDot = dot;
        best = a;
      }
    }
    this.lh[f] = best;
    this.lb[f] = 1000;
  }

  /** One tick. `drift` is the wind's push on a bird (FP cells/tick). */
  step(w: BirdWorld, tick: number, drift: number): void {
    if (this.W === 0) return;
    this.stepFlocks(w, tick, drift);
    for (let i = 0; i < CAP; i++) {
      const f = this.flock[i]!;
      if (f < 0) continue;
      if (this.doom[i]! >= 0 && tick >= this.doom[i]!) {
        this.pulp(w, i, this.doomK[i]!);
        continue;
      }
      let vx = this.vx[i]!;
      let vy = this.vy[i]!;
      const p = this.panic[i]!;
      let top = Math.trunc((17 * FP) / 10);
      if (p > 0) {
        this.panic[i] = p - 1;
        top = Math.trunc((26 * FP) / 10);
        vy -= Math.trunc(FP / 50); // climbs as it flees
      } else {
        // fly to its place in the flock, which breathes and swoops
        const h = this.lh[f]!;
        const c = cosDeci(h);
        const s = sinDeci(h);
        const wob = tick * 18 + i * 974;
        const ox =
          this.ox[i]! + Math.trunc((this.ox[i]! * sinDeci(Math.trunc((wob * 7) / 10))) / (4 * FP));
        const oy =
          this.oy[i]! +
          Math.trunc((this.oy[i]! * 3 * sinDeci(wob)) / (10 * FP)) +
          3 * sinDeci(Math.trunc((wob * 19) / 10));
        const tx = this.lx[f]! + Math.trunc((c * ox - s * oy) / FP);
        const ty = this.ly[f]! + Math.trunc((s * ox + c * oy) / FP);
        let ax = Math.trunc(((tx - this.x[i]!) * 16) / 1000);
        let ay = Math.trunc(((ty - this.y[i]!) * 16) / 1000);
        const lim = Math.trunc((14 * FP) / 100);
        const am = isqrt(toSub(ax) * toSub(ax) + toSub(ay) * toSub(ay)) * (FP / SUB);
        if (am > lim) {
          ax = Math.trunc((ax * lim) / am);
          ay = Math.trunc((ay * lim) / am);
        }
        vx += ax;
        vy += ay;
      }
      // keep a wingspan apart
      const sx = toSub(this.x[i]!);
      const sy = toSub(this.y[i]!);
      for (let j = 0; j < CAP; j++) {
        if (j === i || this.flock[j]! < 0) continue;
        const dx = sx - toSub(this.x[j]!);
        const dy = sy - toSub(this.y[j]!);
        if (dx > 4 * SUB || dx < -4 * SUB || dy > 4 * SUB || dy < -4 * SUB) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 < 16 * SUB * SUB && d2 > (SUB * SUB) / 10) {
          // 0.12 cells/tick per cell over the square of the distance
          vx += Math.trunc((dx * 2013265) / d2);
          vy += Math.trunc((dy * 2013265) / d2);
        }
      }
      // pull up from the ground and roofs ahead, down from the top
      const cx = Math.floor((this.x[i]! + vx * 5) / FP);
      const cy = Math.floor((this.y[i]! + vy * 5) / FP);
      if (w.solid(cx, cy) || w.solid(cx, cy + 3)) {
        vy -= Math.trunc((35 * FP) / 100);
        vx = Math.trunc((vx * 92) / 100);
      } else if (w.solid(cx, cy - 3)) vy += Math.trunc(FP / 4);
      if (this.y[i]! < 4 * FP) vy += Math.trunc((8 * FP) / 100);
      const sp = isqrt(toSub(vx) * toSub(vx) + toSub(vy) * toSub(vy)) * (FP / SUB);
      const lo = Math.trunc((7 * FP) / 10);
      if (sp > top) {
        vx = Math.trunc((vx * top) / sp);
        vy = Math.trunc((vy * top) / sp);
      } else if (sp < lo && sp > 0) {
        vx = Math.trunc((vx * lo) / sp);
        vy = Math.trunc((vy * lo) / sp);
      }
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.x[i] = this.x[i]! + vx + drift;
      this.y[i] = this.y[i]! + vy;
      const bx = Math.floor(this.x[i]! / FP);
      const by = Math.floor(this.y[i]! / FP);
      // buried by falling dirt, or lost far off the map
      if (w.solid(bx, by)) this.pulp(w, i, 200);
      else if (bx < -160 || bx > this.W + 160 || by > this.H) this.flock[i] = -1;
    }
    // the sky refills: a new flock flies in from an edge now and then
    if (tick >= this.nextFlock) {
      this.nextFlock = tick + 900 + this.rng.int(900);
      const alive = this.alive;
      if (alive * 10 < this.want * 6) {
        let f = 0;
        for (; f < FLOCKS; f++) {
          let used = false;
          for (let i = 0; i < CAP; i++) if (this.flock[i] === f) used = true;
          if (!used) break;
        }
        if (f < FLOCKS) {
          const left = this.rng.int(2) === 0;
          const n = Math.min(Math.ceil(this.want / this.flocks), this.want - alive);
          this.spawnFlock(w, f, left ? -30 : this.W + 30, left ? 0 : 1800, n);
        }
      }
    }
  }

  /** Lead points: wandering loops at cruising height, turning back at the edges, never diving. */
  private stepFlocks(w: BirdWorld, tick: number, drift: number): void {
    for (let f = 0; f < FLOCKS; f++) {
      let h = this.lh[f]!;
      this.lt[f] = Math.max(
        -25,
        Math.min(25, Math.trunc((this.lt[f]! * 97) / 100) + this.rng.range(-2, 2)),
      );
      h += this.lt[f]!;
      const x = this.lx[f]!;
      const y = this.ly[f]!;
      const c = cosDeci(h);
      const s = sinDeci(h);
      const xc = Math.floor(x / FP);
      const want = this.cruise(w, xc + Math.trunc((c * 30) / FP), f);
      let tx = c;
      const pull = Math.trunc((FP * 6) / 10);
      const ty = s + Math.max(-pull, Math.min(pull, Math.trunc(((want * FP - y) * 2) / 100)));
      if (xc < 20) tx = FP;
      else if (xc > this.W - 20) tx = -FP;
      // turn towards (tx, ty) by the sine of the angle between, at most 5° a tick
      const tlen = Math.max(1, isqrt(toSub(tx) * toSub(tx) + toSub(ty) * toSub(ty)));
      const cross = toSub(c) * toSub(ty) - toSub(s) * toSub(tx);
      const dot = toSub(c) * toSub(tx) + toSub(s) * toSub(ty);
      let turn = Math.trunc((cross * 50) / (tlen * SUB));
      // pointing away: turn hard, always over the top (a swallow loops up, never dives round)
      if (dot < 0) turn = c < 0 ? 50 : -50;
      h += Math.max(-50, Math.min(50, turn));
      h = ((h % 3600) + 3600) % 3600;
      // swallows wheel in the open air: no steep dives
      if (sinDeci(h) > Math.trunc((FP * 55) / 100)) h = cosDeci(h) >= 0 ? 334 : 1466;
      this.lh[f] = h;
      const boost = this.lb[f]!;
      this.lb[f] = Math.trunc((boost * 985) / 1000);
      const sp =
        Math.trunc((105 * FP) / 100) +
        Math.trunc((3 * sinDeci((tick * 11 + f * 1547) % 3600)) / 10) +
        Math.trunc((boost * 9 * FP) / 10000);
      this.lx[f] = x + Math.trunc((cosDeci(h) * sp) / FP) + drift;
      this.ly[f] = y + Math.trunc((sinDeci(h) * sp) / FP);
    }
  }

  /**
   * Does a shell's path this tick, (x0, y0) → (x1, y1) in FP, pass through a bird? Returns the
   * bird hit first along the path (or -1), and frightens birds it only passes near.
   */
  catch(x0: number, y0: number, x1: number, y1: number): number {
    if (this.W === 0) return -1;
    const ax = toSub(x0);
    const ay = toSub(y0);
    const dx = toSub(x1) - ax;
    const dy = toSub(y1) - ay;
    const len2 = dx * dx + dy * dy;
    const hit2 = HIT_R * SUB * (HIT_R * SUB);
    const near2 = NEAR_R * SUB * (NEAR_R * SUB);
    const m = NEAR_R * SUB;
    const minX = Math.min(ax, ax + dx) - m;
    const maxX = Math.max(ax, ax + dx) + m;
    const minY = Math.min(ay, ay + dy) - m;
    const maxY = Math.max(ay, ay + dy) + m;
    let best = -1;
    let bestU = Infinity;
    for (let i = 0; i < CAP; i++) {
      if (this.flock[i]! < 0) continue;
      const sx = toSub(this.x[i]!);
      const sy = toSub(this.y[i]!);
      if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue;
      const bx = sx - ax;
      const by = sy - ay;
      // closest point on the segment, as the fraction num / len2
      let num = len2 > 0 ? bx * dx + by * dy : 0;
      if (num < 0) num = 0;
      else if (num > len2) num = len2;
      const ex = len2 > 0 ? bx - Math.trunc((dx * num) / len2) : bx;
      const ey = len2 > 0 ? by - Math.trunc((dy * num) / len2) : by;
      const d2 = ex * ex + ey * ey;
      if (d2 < hit2) {
        if (num < bestU) {
          bestU = num;
          best = i;
        }
      } else if (d2 < near2 && this.panic[i] === 0) {
        this.scare(i, Math.floor((sx - ex) / SUB), Math.floor((sy - ey) / SUB), 40);
      }
    }
    return best;
  }

  /** Bird `i` clipped by a shell flying (vx, vy) (FP/tick): feathers, and the flock bolts. */
  hit(w: BirdWorld, i: number, vx: number, vy: number): void {
    const x = Math.floor(this.x[i]! / FP);
    const y = Math.floor(this.y[i]! / FP);
    w.emit('birdHit', x, y, 2, {
      vx: Math.trunc((vx * 100) / FP),
      vy: Math.trunc((vy * 100) / FP),
      bvx: Math.trunc((this.vx[i]! * 100) / FP),
    });
    this.hits++;
    this.kill(i, x, y);
  }

  /** Bird `i` torn apart by a pressure front (closeness `near` ‰): black pixels and feathers. */
  private pulp(w: BirdWorld, i: number, near: number): void {
    const x = Math.floor(this.x[i]! / FP);
    const y = Math.floor(this.y[i]! / FP);
    const doomed = this.doom[i]! >= 0;
    w.emit('birdPulp', x, y, 2, {
      ox: doomed ? this.doomX[i]! : x,
      oy: doomed ? this.doomY[i]! : y + 1,
      near,
    });
    this.pulped++;
    this.kill(i, x, y);
  }

  private kill(i: number, x: number, y: number): void {
    this.flock[i] = -1;
    this.doom[i] = -1;
    this.startle(x, y, 40);
  }

  /** Birds for renderers, flattened x, y, vx, vy (1/256 cell and cell/tick), panic ticks. */
  view(): number[] {
    const out: number[] = [];
    for (let i = 0; i < CAP; i++) {
      if (this.flock[i]! < 0) continue;
      out.push(
        toSub(this.x[i]!),
        toSub(this.y[i]!),
        toSub(this.vx[i]!),
        toSub(this.vy[i]!),
        this.panic[i]!,
      );
    }
    return out;
  }

  hash(h: Hasher): void {
    for (let i = 0; i < 4; i++) h.u32(this.rng.state[i]!);
    h.num(this.W).num(this.nextFlock).num(this.want).num(this.flocks);
    for (let f = 0; f < FLOCKS; f++)
      h.num(this.lx[f]!).num(this.ly[f]!).num(this.lh[f]!).num(this.lt[f]!).num(this.lb[f]!);
    for (let i = 0; i < CAP; i++) {
      h.num(this.flock[i]!);
      if (this.flock[i]! < 0) continue;
      h.num(this.x[i]!).num(this.y[i]!).num(this.vx[i]!).num(this.vy[i]!);
      h.num(this.ox[i]!).num(this.oy[i]!).num(this.panic[i]!).num(this.doom[i]!);
    }
  }
}

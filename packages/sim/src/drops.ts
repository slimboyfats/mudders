import { FP } from '@mudders/shared';
import { isqrt, sinDeci } from './fixed';
import type { Hasher } from './hash';
import { Prng } from './prng';

/**
 * Supply drops (kernel 0.40.0): wooden crates that come down under a parachute during a match and
 * hold whatever the mode's loot table put in them. A crate is a small rigid body: it swings under
 * its canopy and drifts with the wind, lands, tips over an edge and tumbles down a slope a quarter
 * turn at a time, floats on water, burns in fire, and blasts throw it, spin it and smash it. A
 * shell flying into the canopy tears it, and the crate drops like a stone. Any tank that touches a
 * crate (driving, falling, teleporting) takes what is inside.
 *
 * Fixed-point positions (centre of the crate) and velocities, integer math with the table trig,
 * own PRNG seeded from the match seed and round so turning drops on never shifts the match RNG.
 * Fixed-size typed arrays, removal by state: nothing allocates per tick. Only stepped and hashed
 * while `MatchRules.drops` is on.
 */

/** Most crates on the map at once. */
export const DROP_CAP = 6;
/** Crate edge in cells (square, so a quarter turn keeps its footprint). */
export const DROP_SIZE = 8;
const HALF = DROP_SIZE >> 1;
/** Canopy: width, height and how far its bottom hangs above the crate's top, in cells. */
export const CANOPY_W = 15;
export const CANOPY_H = 5;
export const CANOPY_LINE = 9;

export const DROP_FREE = 0;
/** Coming down under the canopy. */
export const DROP_CHUTE = 1;
/** Flying free: thrown by a blast, dropped by a torn chute, falling off a ledge. */
export const DROP_AIR = 2;
export const DROP_REST = 3;
/** Tipping over a quarter turn about its bottom corner. */
export const DROP_TUMBLE = 4;

/** Ticks a quarter-turn tumble takes. */
const TUMBLE_TICKS = 9;
/** Landing faster than this (FP cells/tick) hurts the crate; ×10 hp per cell/tick over. */
const HURT_SPEED = (FP * 7) >> 1;
/** Below this the crate stops bouncing. */
const BOUNCE_SPEED = (FP * 6) >> 2;
/** Fastest a crate flies, so a sub-step never skips a wall. */
const MAX_SPEED = FP * 7;
/** Ticks slow enough on water before a floating crate counts as still. */
const FLOAT_STILL = 20;

export interface DropWorld {
  readonly width: number;
  readonly height: number;
  /** Something a crate rests on (not air, gas or liquid). */
  solid(x: number, y: number): boolean;
  liquid(x: number, y: number): boolean;
  hot(x: number, y: number): boolean;
  emit(type: string, x: number, y: number, radius: number, params?: Record<string, number>): void;
}

export interface DropTuning {
  /** Canopy descent speed, FP cells/tick. */
  fall: number;
  /** FP cells/tick². */
  gravity: number;
  hp: number;
}

export class Drops {
  readonly state = new Int8Array(DROP_CAP);
  /** Stable id while the crate lives (renderers key animations on it). */
  readonly id = new Int32Array(DROP_CAP);
  /** Centre, FP cells. */
  readonly x = new Int32Array(DROP_CAP);
  readonly y = new Int32Array(DROP_CAP);
  readonly vx = new Int32Array(DROP_CAP);
  readonly vy = new Int32Array(DROP_CAP);
  /** Rotation in deci-degrees (y down, clockwise positive) and spin per tick. */
  readonly ang = new Int32Array(DROP_CAP);
  readonly spin = new Int32Array(DROP_CAP);
  readonly hp = new Int16Array(DROP_CAP);
  /** Loot-table entry inside. */
  readonly loot = new Int16Array(DROP_CAP);
  /** Under the canopy: its point (FP), the crate's swing offset from under it and swing speed. */
  readonly ax = new Int32Array(DROP_CAP);
  readonly swing = new Int32Array(DROP_CAP);
  readonly swingV = new Int32Array(DROP_CAP);
  /** Tumble: direction (-1/1), ticks done, pivot (FP) and the angle it started from. */
  private readonly tDir = new Int8Array(DROP_CAP);
  private readonly tStep = new Int8Array(DROP_CAP);
  private readonly tPx = new Int32Array(DROP_CAP);
  private readonly tPy = new Int32Array(DROP_CAP);
  private readonly tAng = new Int32Array(DROP_CAP);
  /** Ticks in a row nearly still while flying (floating on water). */
  private readonly calm = new Int16Array(DROP_CAP);
  rng = new Prng(1);
  private nextId = 1;
  /** Turns until the next drop. */
  wait = 0;

  /** A new round: no crates, a fresh PRNG. */
  reset(seed: number, round: number, firstWait: number): void {
    this.state.fill(DROP_FREE);
    this.rng = new Prng((seed ^ 0x2c4a7e1 ^ Math.imul(round + 1, 0x85ebca6b)) >>> 0);
    this.wait = firstWait;
  }

  get count(): number {
    let n = 0;
    for (let i = 0; i < DROP_CAP; i++) if (this.state[i] !== DROP_FREE) n++;
    return n;
  }

  /** Whether any crate is flying or tumbling (the turn waits for it to come to rest). */
  get moving(): boolean {
    for (let i = 0; i < DROP_CAP; i++) {
      const s = this.state[i]!;
      if (s === DROP_TUMBLE) return true;
      if (s === DROP_AIR && this.calm[i]! < FLOAT_STILL) return true;
    }
    return false;
  }

  /**
   * Open sky to drop into over column `cx`: the row the crate starts at (its centre, cells), or -1
   * when no gap tall enough for crate and canopy opens below the top (a cave roof).
   */
  startRow(w: DropWorld, cx: number): number {
    const need = DROP_SIZE + CANOPY_LINE + CANOPY_H + 2;
    let run = 0;
    for (let y = 0; y < w.height; y++) {
      let open = true;
      for (let x = cx - HALF; x < cx + HALF && open; x++) if (w.solid(x, y)) open = false;
      run = open ? run + 1 : 0;
      if (run >= need) return y - HALF - 1;
    }
    return -1;
  }

  /** Drop a crate over column `cx` holding loot entry `loot`; -1 when the sky is full or closed. */
  spawn(w: DropWorld, cx: number, loot: number, hp: number): number {
    let i = 0;
    while (i < DROP_CAP && this.state[i] !== DROP_FREE) i++;
    if (i >= DROP_CAP) return -1;
    const x = Math.max(HALF + 1, Math.min(w.width - HALF - 2, cx));
    const row = this.startRow(w, x);
    if (row < 0) return -1;
    this.state[i] = DROP_CHUTE;
    this.id[i] = this.nextId++;
    this.x[i] = this.ax[i] = x * FP;
    this.y[i] = row * FP;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.ang[i] = 0;
    this.spin[i] = 0;
    this.hp[i] = hp;
    this.loot[i] = loot;
    this.calm[i] = 0;
    // it leaves the plane with a little sway already in it
    this.swing[i] = 0;
    this.swingV[i] = (this.rng.int(2) === 0 ? -1 : 1) * (FP / 24 + this.rng.int(FP / 24));
    w.emit('dropSpawn', x, row, HALF, { id: this.id[i]!, loot });
    return i;
  }

  private cellX(i: number): number {
    return Math.floor(this.x[i]! / FP);
  }

  private cellY(i: number): number {
    return Math.floor(this.y[i]! / FP);
  }

  /** Whether the crate's box at centre (x, y) FP overlaps anything solid. */
  private blocked(w: DropWorld, x: number, y: number): boolean {
    const x0 = Math.floor(x / FP) - HALF;
    const y0 = Math.floor(y / FP) - HALF;
    for (let cy = y0; cy < y0 + DROP_SIZE; cy++) {
      if (cy >= w.height) return true;
      if (cy < 0) continue;
      for (let cx = x0; cx < x0 + DROP_SIZE; cx++) {
        if (cx < 0 || cx >= w.width || w.solid(cx, cy)) return true;
      }
    }
    return false;
  }

  /** Columns under the crate's bottom row that hold it up: a bit per column, left to right. */
  private footing(w: DropWorld, i: number): number {
    const x0 = this.cellX(i) - HALF;
    const by = this.cellY(i) + HALF;
    let m = 0;
    for (let k = 0; k < DROP_SIZE; k++) if (w.solid(x0 + k, by)) m |= 1 << k;
    return m;
  }

  /** Rows of the crate under liquid, 0..DROP_SIZE (sampled down its middle column). */
  private wet(w: DropWorld, i: number): number {
    const cx = this.cellX(i);
    const y0 = this.cellY(i) - HALF;
    let n = 0;
    for (let k = 0; k < DROP_SIZE; k++) if (w.liquid(cx, y0 + k)) n++;
    return n;
  }

  step(w: DropWorld, t: DropTuning, wind: number, tick: number): void {
    for (let i = 0; i < DROP_CAP; i++) {
      const s = this.state[i]!;
      if (s === DROP_FREE) continue;
      if (s === DROP_CHUTE) this.stepChute(w, t, i, wind);
      else if (s === DROP_AIR) this.stepAir(w, t, i);
      else if (s === DROP_REST) this.stepRest(w, i);
      else this.stepTumble(w, i);
      if (this.state[i] === DROP_FREE) continue;
      // fire chars the planks; a crate that stands in it long enough burns through
      if ((tick & 7) === 0 && w.hot(this.cellX(i), this.cellY(i) + HALF - 1)) {
        this.hp[i] = this.hp[i]! - 1;
        if ((tick & 31) === 0)
          w.emit('dropBurn', this.cellX(i), this.cellY(i), HALF, { id: this.id[i]! });
        if (this.hp[i]! <= 0) this.smash(w, i);
      }
    }
  }

  private stepChute(w: DropWorld, t: DropTuning, i: number, wind: number): void {
    // the canopy rides the wind and sinks at its own speed
    const drift = Math.max(-FP, Math.min(FP, wind * 40));
    const dvx = (drift - this.vx[i]!) >> 4;
    this.vx[i] = this.vx[i]! + dvx;
    this.vy[i] = this.vy[i]! + ((t.fall - this.vy[i]!) >> 3);
    // the crate swings under it: a damped pendulum, kicked the other way when the canopy speeds up
    this.swingV[i] = this.swingV[i]! - (this.swing[i]! >> 6) - (this.swingV[i]! >> 7) - dvx * 6;
    this.swing[i] = Math.max(-4 * FP, Math.min(4 * FP, this.swing[i]! + this.swingV[i]!));
    const ax = Math.max(HALF * FP, Math.min((w.width - HALF - 1) * FP, this.ax[i]! + this.vx[i]!));
    this.ax[i] = ax;
    const nx = ax + this.swing[i]!;
    const ny = this.y[i]! + this.vy[i]!;
    // the crate leans with its swing (about 4.8° per cell out)
    this.ang[i] = Math.trunc((this.swing[i]! * 48) / FP);
    if (this.wet(w, i) >= HALF) {
      // into water: the canopy folds over it and it floats
      this.release(w, i, 0);
      return;
    }
    if (this.blocked(w, nx, ny)) {
      // landed: step down as far as it goes, then let go of the canopy
      let y = this.y[i]!;
      for (let k = 0; k < 4 && !this.blocked(w, this.x[i]!, y + (FP >> 2)); k++) y += FP >> 2;
      this.y[i] = y;
      this.release(w, i, 1);
      return;
    }
    this.x[i] = nx;
    this.y[i] = ny;
    if (Math.floor(ny / FP) - HALF >= w.height) this.lose(w, i);
  }

  /** Let go of the canopy (landed: `hard` 1, in water 0): the crate carries on by itself. */
  private release(w: DropWorld, i: number, hard: number): void {
    this.state[i] = hard ? DROP_REST : DROP_AIR;
    this.vx[i] = (this.swingV[i]! * 3) >> 2;
    this.spin[i] = 0;
    this.calm[i] = 0;
    if (hard) {
      this.vx[i] = 0;
      this.vy[i] = 0;
      this.ang[i] = 0;
    }
    w.emit('dropLand', this.cellX(i), this.cellY(i) + HALF, HALF, {
      id: this.id[i]!,
      chute: 1,
      ax: Math.floor(this.ax[i]! / FP),
      speed: 0,
    });
  }

  private stepAir(w: DropWorld, t: DropTuning, i: number): void {
    const sub = this.wet(w, i);
    let vx = this.vx[i]!;
    let vy = this.vy[i]! + t.gravity;
    if (sub > 0) {
      // wood floats about half under: buoyancy past the waterline, and the water drags
      vy -= Math.trunc((t.gravity * sub * 2) / HALF);
      vy -= vy >> 3;
      vx -= vx >> 4;
      this.spin[i] = this.spin[i]! - (this.spin[i]! >> 3);
      // and it rights itself
      const off = this.squareOff(i);
      this.ang[i] = this.ang[i]! - (off >> 3);
    }
    vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx));
    vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vy));
    this.ang[i] = this.ang[i]! + this.spin[i]!;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) / FP));
    let x = this.x[i]!;
    let y = this.y[i]!;
    let landed = false;
    for (let k = 0; k < n; k++) {
      const sx = Math.trunc(vx / n);
      if (sx !== 0 && this.blocked(w, x + sx, y)) {
        // into a wall: bounce back with most of the speed gone
        vx = -Math.trunc((vx * 2) / 5);
        this.spin[i] = -(this.spin[i]! >> 1);
        w.emit('dropKnock', Math.floor(x / FP), Math.floor(y / FP), HALF, { id: this.id[i]! });
      } else {
        x += sx;
      }
      const sy = Math.trunc(vy / n);
      if (sy !== 0 && this.blocked(w, x, y + sy)) {
        if (sy > 0) {
          landed = true;
          break;
        }
        vy = 0;
      } else {
        y += sy;
      }
    }
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    if (Math.floor(y / FP) - HALF >= w.height) {
      this.lose(w, i);
      return;
    }
    if (landed) {
      // nudge down onto the ground
      for (let k = 0; k < 4 && !this.blocked(w, x, this.y[i]! + (FP >> 2)); k++) {
        this.y[i] = this.y[i]! + (FP >> 2);
      }
      this.land(w, i, vy);
      return;
    }
    const slow = Math.abs(vx) < FP >> 4 && Math.abs(vy) < FP >> 4 && sub > 0;
    this.calm[i] = slow ? Math.min(FLOAT_STILL, this.calm[i]! + 1) : 0;
  }

  /** Signed deci-degrees from the nearest quarter turn (-449..450). */
  private squareOff(i: number): number {
    let a = this.ang[i]! % 900;
    if (a < 0) a += 900;
    return a > 450 ? a - 900 : a;
  }

  private land(w: DropWorld, i: number, vy: number): void {
    const speed = vy;
    if (speed > HURT_SPEED) {
      this.hp[i] = this.hp[i]! - Math.trunc(((speed - HURT_SPEED) * 10) / FP);
      if (this.hp[i]! <= 0) {
        this.smash(w, i);
        return;
      }
    }
    w.emit('dropLand', this.cellX(i), this.cellY(i) + HALF, HALF, {
      id: this.id[i]!,
      chute: 0,
      speed: Math.trunc((speed * 10) / FP),
    });
    if (speed > BOUNCE_SPEED) {
      // a hard landing bounces: up a little, slower sideways, spinning with its slide
      this.vy[i] = -Math.trunc((speed * 3) / 10);
      this.vx[i] = Math.trunc((this.vx[i]! * 7) / 10);
      this.spin[i] = Math.trunc((this.vx[i]! * 40) / FP) + (this.spin[i]! >> 1);
      return;
    }
    // it comes down flat on whichever face is nearest
    this.ang[i] = this.ang[i]! - this.squareOff(i);
    this.spin[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.state[i] = DROP_REST;
  }

  private stepRest(w: DropWorld, i: number): void {
    if (this.cellY(i) + HALF >= w.height) {
      this.lose(w, i);
      return;
    }
    if (this.wet(w, i) > HALF) {
      // the water rose round it: it lifts off and floats
      this.state[i] = DROP_AIR;
      this.calm[i] = 0;
      return;
    }
    const foot = this.footing(w, i);
    if (foot === 0) {
      // the ground went from under it
      this.state[i] = DROP_AIR;
      this.vy[i] = 0;
      this.calm[i] = 0;
      return;
    }
    // it tips when its middle is past the last column holding it up
    let lo = -1;
    let hi = -1;
    for (let k = 0; k < DROP_SIZE; k++) {
      if ((foot & (1 << k)) === 0) continue;
      if (lo < 0) lo = k;
      hi = k;
    }
    // the centre sits on the line between columns HALF-1 and HALF: past the last column holding
    // it up (or right on its edge) it goes over that way, pivoting on that column's corner
    if (hi < HALF) this.startTumble(w, i, 1);
    else if (lo >= HALF) this.startTumble(w, i, -1);
  }

  /**
   * Begin a quarter turn over its side `dir`: it ends a crate width that way, dropped onto the
   * ground there (or up a step of up to half its height). Against a wall it stays where it is.
   */
  private startTumble(w: DropWorld, i: number, dir: number): void {
    const x = this.x[i]!;
    const nx = x + dir * DROP_SIZE * FP;
    let ny = this.y[i]!;
    let up = 0;
    while (up < HALF && this.blocked(w, nx, ny)) {
      ny -= FP;
      up++;
    }
    if (this.blocked(w, nx, ny)) return;
    for (let k = 0; k < DROP_SIZE && !this.blocked(w, nx, ny + FP); k++) ny += FP;
    // it only goes over downhill: wedged in a dip it leans on the far side and stays
    if (ny <= this.y[i]!) return;
    this.state[i] = DROP_TUMBLE;
    this.tDir[i] = dir;
    this.tStep[i] = 0;
    this.tPx[i] = x;
    this.tPy[i] = this.y[i]!;
    this.tAng[i] = this.ang[i]!;
    this.vx[i] = nx;
    this.vy[i] = ny;
  }

  /** Where tumble `i` is `s` ticks in: along an arc to its end, rising onto its corner midway. */
  private tumbleAt(i: number, s: number): void {
    const dir = this.tDir[i]!;
    // speeding up as it goes over, like a box falling onto its side
    const f = Math.trunc((1000 * s * s) / (TUMBLE_TICKS * TUMBLE_TICKS));
    const sx = this.tPx[i]!;
    const sy = this.tPy[i]!;
    // up on its corner the centre stands √2 higher: (√2 - 1) × half a crate
    const rise = Math.trunc(
      (((HALF * FP * 414) / 1000) * sinDeci(Math.trunc((1800 * f) / 1000))) / FP,
    );
    this.x[i] = sx + Math.trunc(((this.vx[i]! - sx) * f) / 1000);
    this.y[i] = sy + Math.trunc(((this.vy[i]! - sy) * f) / 1000) - rise;
    this.ang[i] = this.tAng[i]! + Math.trunc((900 * f) / 1000) * dir;
  }

  private stepTumble(w: DropWorld, i: number): void {
    const s = this.tStep[i]! + 1;
    this.tStep[i] = s;
    this.tumbleAt(i, s);
    if (s < TUMBLE_TICKS) return;
    const dir = this.tDir[i]!;
    // over: it lands on its next face and carries on falling onto whatever is there
    this.vx[i] = dir * (FP >> 3);
    this.vy[i] = FP >> 1;
    this.spin[i] = 0;
    this.calm[i] = 0;
    this.state[i] = DROP_AIR;
    w.emit('dropTumble', this.cellX(i), this.cellY(i) + HALF, HALF, { id: this.id[i]!, dir });
  }

  /**
   * A blast at cell (bx, by): crates within `reach` cells get thrown and spun, those within the
   * fireball (`radius`) hurt by up to `damage`. Hanging crates lose their canopy. Returns how many
   * crates it broke.
   */
  blast(
    w: DropWorld,
    bx: number,
    by: number,
    radius: number,
    reach: number,
    damage: number,
  ): number {
    let broke = 0;
    for (let i = 0; i < DROP_CAP; i++) {
      if (this.state[i] === DROP_FREE) continue;
      const dx = this.cellX(i) - bx;
      const dy = this.cellY(i) - by;
      const d = isqrt(dx * dx + dy * dy);
      const far = reach + HALF;
      if (d >= far) continue;
      const near = radius + HALF;
      if (damage > 0 && d < near) {
        this.hp[i] = this.hp[i]! - Math.max(1, Math.trunc((damage * (near - d)) / near));
        if (this.hp[i]! <= 0) {
          this.smash(w, i);
          broke++;
          continue;
        }
      }
      if (this.state[i] === DROP_CHUTE) {
        w.emit(
          'dropChuteTorn',
          Math.floor(this.ax[i]! / FP),
          this.cellY(i) - HALF - CANOPY_LINE,
          CANOPY_W >> 1,
          {
            id: this.id[i]!,
          },
        );
      }
      // thrown away from the blast and a little up, the closer the harder
      const k = Math.trunc(((far - d) * 1000) / far);
      const v = Math.trunc((MAX_SPEED * k) / 1400);
      const len = Math.max(1, d);
      this.vx[i] = this.vx[i]! + Math.trunc((v * dx) / len);
      // the ground under it kicks back too: blasts lift crates, never drive them into the dirt
      this.vy[i] = this.vy[i]! + Math.min(0, Math.trunc((v * dy) / len)) - Math.trunc((v * 2) / 3);
      this.spin[i] =
        this.spin[i]! + (dx >= 0 ? 1 : -1) * Math.trunc((k * 60) / 1000) + this.rng.range(-8, 8);
      this.calm[i] = 0;
      if (this.state[i] === DROP_TUMBLE) {
        // the push catches it mid-roll: it flies from wherever it is
        this.vx[i] = Math.trunc((v * dx) / len);
        this.vy[i] = Math.min(0, Math.trunc((v * dy) / len)) - Math.trunc((v * 2) / 3);
      }
      this.state[i] = DROP_AIR;
      if (this.blocked(w, this.x[i]!, this.y[i]!)) {
        // half buried by the blast's own dirt: lift it clear first
        let y = this.y[i]!;
        for (let s = 0; s < DROP_SIZE && this.blocked(w, this.x[i]!, y); s++) y -= FP;
        this.y[i] = y;
      }
    }
    return broke;
  }

  /** Index of the crate whose box the segment (FP cells) passes through, or -1. Tears canopies it crosses. */
  catchShell(w: DropWorld, x0: number, y0: number, x1: number, y1: number): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / FP));
    for (let s = 1; s <= n; s++) {
      const px = Math.floor((x0 + Math.trunc((dx * s) / n)) / FP);
      const py = Math.floor((y0 + Math.trunc((dy * s) / n)) / FP);
      for (let i = 0; i < DROP_CAP; i++) {
        const st = this.state[i]!;
        if (st === DROP_FREE) continue;
        const cx = this.cellX(i);
        const cy = this.cellY(i);
        if (px >= cx - HALF && px < cx + HALF && py >= cy - HALF && py < cy + HALF) return i;
        if (st !== DROP_CHUTE) continue;
        const ax = Math.floor(this.ax[i]! / FP);
        const top = cy - HALF - CANOPY_LINE - CANOPY_H;
        if (
          px >= ax - (CANOPY_W >> 1) &&
          px <= ax + (CANOPY_W >> 1) &&
          py >= top &&
          py < top + CANOPY_H
        ) {
          // through the cloth: it rips and the crate falls free
          w.emit('dropChuteTorn', ax, top + (CANOPY_H >> 1), CANOPY_W >> 1, { id: this.id[i]! });
          this.state[i] = DROP_AIR;
          this.vx[i] = this.swingV[i]!;
          this.calm[i] = 0;
        }
      }
    }
    return -1;
  }

  /** Index of a crate that touches the box [x0, x1) × [y0, y1) in cells, or -1. */
  touching(x0: number, y0: number, x1: number, y1: number): number {
    for (let i = 0; i < DROP_CAP; i++) {
      if (this.state[i] === DROP_FREE) continue;
      const cx = this.cellX(i);
      const cy = this.cellY(i);
      if (x0 < cx + HALF && x1 > cx - HALF && y0 < cy + HALF && y1 > cy - HALF) return i;
    }
    return -1;
  }

  /** Crate `i` is taken: gone from the map. */
  take(i: number): void {
    this.state[i] = DROP_FREE;
  }

  /** Smashed to splinters (the world throws the wood). */
  smash(w: DropWorld, i: number): void {
    w.emit('dropBreak', this.cellX(i), this.cellY(i), HALF, {
      id: this.id[i]!,
      loot: this.loot[i]!,
      vx: Math.trunc((this.vx[i]! * 100) / FP),
      vy: Math.trunc((this.vy[i]! * 100) / FP),
    });
    this.state[i] = DROP_FREE;
  }

  private lose(w: DropWorld, i: number): void {
    w.emit('dropLost', this.cellX(i), w.height - 1, HALF, { id: this.id[i]! });
    this.state[i] = DROP_FREE;
  }

  hash(h: Hasher): void {
    for (let i = 0; i < 4; i++) h.u32(this.rng.state[i]!);
    h.num(this.nextId).num(this.wait);
    for (let i = 0; i < DROP_CAP; i++) {
      h.num(this.state[i]!);
      if (this.state[i] === DROP_FREE) continue;
      h.num(this.id[i]!).num(this.x[i]!).num(this.y[i]!).num(this.vx[i]!).num(this.vy[i]!);
      h.num(this.ang[i]!).num(this.spin[i]!).num(this.hp[i]!).num(this.loot[i]!);
      h.num(this.ax[i]!).num(this.swing[i]!).num(this.swingV[i]!).num(this.calm[i]!);
      h.num(this.tDir[i]!)
        .num(this.tStep[i]!)
        .num(this.tPx[i]!)
        .num(this.tPy[i]!)
        .num(this.tAng[i]!);
    }
  }
}

import type { QuadBatch } from './batch';
import { shade } from './theme';

/**
 * Debris chunks (cosmetic, §2a): clods of real terrain colour thrown by big blasts. Unlike the
 * one-cell `PKind.Chunk` spray, these are 2–4 cell blocks that tumble in flight, bounce off the
 * live terrain, slide to a stop, lie on the ground a while and then crumble away cell by cell.
 *
 * Purely visual: they never touch the sim (cells that become terrain are sim debris). Collision
 * reads the renderer's latest terrain, so a chunk resting on ground a later blast removes falls
 * again. Struct-of-arrays, fixed capacity, stepped once per sim tick so captures replay exactly.
 */

/** Reads solid cells; renderer-provided. */
export interface SolidProbe {
  solid(x: number, y: number): boolean;
}

export interface ChunkEmit {
  /** Centre, in map cells. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Footprint in cells (1–4 each). */
  w: number;
  h: number;
  color: number;
  /** Ticks it lies at rest before it crumbles. */
  rest: number;
}

/** Bounce: share of vertical speed kept, and of sideways speed kept on each ground hit. */
const BOUNCE = 0.42;
const SKID = 0.72;
/** Below this landing speed a chunk stops bouncing and slides. */
const STICK = 0.55;
/** Sideways speed lost per tick while sliding on the ground. */
const FRICTION = 0.8;
/** Ticks a resting chunk takes to crumble away. */
const CRUMBLE = 24;
const MAX_SPEED = 6;

export class Chunks {
  readonly cap: number;
  n = 0;
  /** Top-left corner, in cells. */
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly w: Uint8Array;
  private readonly h: Uint8Array;
  private readonly color: Uint32Array;
  private readonly age: Uint16Array;
  /** Ticks left at rest before crumbling; counts down only while grounded and still. */
  private readonly rest: Uint16Array;
  /** Ticks into the crumble (0 = whole). */
  private readonly gone: Uint8Array;
  /** 1 while sitting on the ground. */
  private readonly ground: Uint8Array;

  constructor(
    cap: number,
    private readonly probe: SolidProbe,
    /** Called with (x, y, impact speed) on a hard landing, for a dust puff. */
    private readonly onThud?: (x: number, y: number, speed: number) => void,
  ) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.w = new Uint8Array(cap);
    this.h = new Uint8Array(cap);
    this.color = new Uint32Array(cap);
    this.age = new Uint16Array(cap);
    this.rest = new Uint16Array(cap);
    this.gone = new Uint8Array(cap);
    this.ground = new Uint8Array(cap);
  }

  /** Add a chunk; when full, the one nearest the end of its rest is replaced (cosmetic). */
  add(e: ChunkEmit): void {
    const w = Math.max(1, Math.min(4, Math.round(e.w)));
    const h = Math.max(1, Math.min(4, Math.round(e.h)));
    const x = Math.floor(e.x - w / 2);
    const y = Math.floor(e.y - h / 2);
    // never spawn inside the ground: nudge up out of it, or drop the chunk
    let yy = y;
    while (yy > y - 8 && this.hit(x, yy, w, h)) yy--;
    if (this.hit(x, yy, w, h)) return;
    let i = this.n;
    if (i >= this.cap) {
      let best = 0;
      let bestLeft = Infinity;
      for (let j = 0; j < this.n; j++) {
        const left = this.ground[j]! ? this.rest[j]! - this.gone[j]! : 1e6;
        if (left < bestLeft) {
          bestLeft = left;
          best = j;
        }
      }
      i = best;
    } else {
      this.n++;
    }
    this.x[i] = x;
    this.y[i] = yy;
    this.vx[i] = e.vx;
    this.vy[i] = e.vy;
    this.w[i] = w;
    this.h[i] = h;
    this.color[i] = e.color;
    this.age[i] = 0;
    this.rest[i] = Math.max(1, Math.min(65535, Math.round(e.rest)));
    this.gone[i] = 0;
    this.ground[i] = 0;
  }

  /** True if any cell of the w×h box at (x, y) (floored) is solid. */
  private hit(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) if (this.probe.solid(x0 + dx, y0 + dy)) return true;
    }
    return false;
  }

  /** One sim tick: gravity, bounces, sliding, rest and crumble. */
  step(gravity: number, mapHeight: number): void {
    let o = 0;
    for (let i = 0; i < this.n; i++) {
      let x = this.x[i]!;
      let y = this.y[i]!;
      let vx = this.vx[i]!;
      let vy = this.vy[i]!;
      let w = this.w[i]!;
      let h = this.h[i]!;
      let rest = this.rest[i]!;
      let gone = this.gone[i]!;
      let ground = this.ground[i]!;
      const age = this.age[i]! + 1;

      // resting: stay put unless the ground under it went away
      if (ground && this.hit(x, y + 1, w, h)) {
        if (vx !== 0) {
          // slide along the surface, stepping up one-cell lips
          const nx = x + vx;
          if (!this.hit(nx, y, w, h)) x = nx;
          else if (!this.hit(nx, y - 1, w, h)) {
            x = nx;
            y -= 1;
          } else vx = -vx * 0.3;
          vx *= FRICTION;
          if (Math.abs(vx) < 0.05) {
            vx = 0;
            x = Math.floor(x);
          }
        } else if (rest > 0) rest--;
        else if (++gone >= CRUMBLE) continue;
      } else {
        // airborne: fall, tumbling (the footprint swaps w/h every few ticks)
        ground = 0;
        vy = Math.min(MAX_SPEED, vy + gravity);
        vx *= 0.995;
        if (w !== h && (age & 7) === 0 && !this.hit(x, y, h, w)) {
          const t = w;
          w = h;
          h = t;
        }
        // sub-step so fast chunks never tunnel through a thin crust
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy))));
        const sx = vx / steps;
        const sy = vy / steps;
        for (let s = 0; s < steps; s++) {
          if (!this.hit(x + sx, y, w, h)) x += sx;
          else {
            vx = -vx * 0.45;
            break;
          }
          if (!this.hit(x, y + sy, w, h)) {
            y += sy;
            continue;
          }
          if (sy > 0) {
            // landed: settle onto the surface, then bounce or stick
            y = Math.floor(y + sy);
            while (this.hit(x, y, w, h)) y--;
            const speed = vy;
            if (speed > 1.2 && this.onThud) this.onThud(x + w / 2, y + h, speed);
            if (speed < STICK) {
              vy = 0;
              ground = 1;
              // land flat: lying chunks are wider than tall
              if (h > w && !this.hit(x, y + h - w, h, w)) {
                const tall = h;
                h = w;
                w = tall;
                y += tall - h;
              }
            } else {
              vy = -speed * BOUNCE;
              vx *= SKID;
            }
          } else {
            // hit a ceiling
            vy = 0;
          }
          break;
        }
      }
      if (y > mapHeight + 8) continue;
      this.x[o] = x;
      this.y[o] = y;
      this.vx[o] = vx;
      this.vy[o] = vy;
      this.w[o] = w;
      this.h[o] = h;
      this.color[o] = this.color[i]!;
      this.age[o] = Math.min(65535, age);
      this.rest[o] = rest;
      this.gone[o] = gone;
      this.ground[o] = ground;
      o++;
    }
    this.n = o;
  }

  /**
   * Draw as hard-edged blocks on the cell grid: a lit top row, a shaded bottom row, and while
   * crumbling the block loses cells from the top down (no alpha fade, no smoothing).
   */
  draw(batch: QuadBatch): void {
    for (let i = 0; i < this.n; i++) {
      const w = this.w[i]!;
      let h = this.h[i]!;
      const x0 = Math.floor(this.x[i]!);
      let y0 = Math.floor(this.y[i]!);
      const c = this.color[i]!;
      const gone = this.gone[i]!;
      if (gone > 0) {
        // crumble: lose a row at a time, the last row breaking into separate cells
        const lost = Math.floor((gone * (h + 1)) / CRUMBLE);
        if (lost >= h) {
          // the last cells, every other one, flickering out
          for (let dx = (gone & 1) as number; dx < w; dx += 2) {
            batch.push(x0 + dx + 0.5, y0 + h - 0.5, 1, 1, shade(c, 0.8), 1);
          }
          continue;
        }
        y0 += lost;
        h -= lost;
      }
      const cx = x0 + w / 2;
      batch.push(cx, y0 + h / 2, w, h, c, 1);
      if (h >= 2) {
        batch.push(cx, y0 + 0.5, w, 1, shade(c, 1.22), 1);
        batch.push(cx, y0 + h - 0.5, w, 1, shade(c, 0.68), 1);
      } else {
        batch.push(x0 + 0.5, y0 + 0.5, 1, 1, shade(c, 1.22), 1);
      }
    }
  }

  clear(): void {
    this.n = 0;
  }
}

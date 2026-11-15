import type { FluidSink } from './fluid';
import { PKind, type ParticleSink } from './particles';

/**
 * Blast skirts (renderer only): a blast that goes off on or near the ground drives a low wall of
 * its dust out along the surface both ways, the way a real blast wave sweeps the ground. Each
 * side's front runs out fast and brakes, follows the ground up and down slopes, kicks grit up as
 * it passes and stops at a wall it can't climb. The dust is the ground's own colour, in whole-cell
 * puffs that settle out within a couple of seconds.
 *
 * Seeded from the event, stepped once per sim tick, so captures replay byte-identically.
 */

export interface SkirtGround {
  solid(x: number, y: number): boolean;
  /** Colour of the ground at a surface cell, for the dust. */
  dust(x: number, y: number): number;
  width: number;
  height: number;
}

interface Front {
  /** Signed distance of the front from the blast, cells. */
  d: number;
  v: number;
  /** Surface row the front last stood on (-1 = stopped). */
  y: number;
}

interface Skirt {
  x: number;
  y: number;
  r: number;
  start: number;
  life: number;
  seed: number;
  fronts: [Front, Front];
}

/** Smallest blast that throws a skirt, cells. */
export const SKIRT_MIN_RADIUS = 10;
/** Most skirts running at once (a MIRV landing five at a time keeps them all). */
const MAX_SKIRTS = 12;
/** Highest step a front climbs in one cell of travel. */
const CLIMB = 4;

function hash(a: number, b: number): number {
  let x = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return (x ^ (x >>> 15)) >>> 0;
}

/** The surface row in column x near row `y` (first air-over-solid going down), or -1. */
export function surfaceNear(
  g: SkirtGround,
  x: number,
  y: number,
  up: number,
  down: number,
): number {
  if (x < 0 || x >= g.width) return -1;
  let top = Math.max(0, Math.round(y) - up);
  // start in the air: if the band starts inside the ground, climb out first
  while (top > 0 && g.solid(x, top)) top--;
  if (g.solid(x, top)) return -1;
  const bottom = Math.min(g.height - 1, Math.round(y) + down);
  for (let yy = top + 1; yy <= bottom; yy++) if (g.solid(x, yy)) return yy;
  return -1;
}

export class BlastSkirts {
  private skirts: Skirt[] = [];

  /** A blast of `radius` at (x, y) at `tick`; only ground-hugging blasts throw a skirt. */
  blast(
    x: number,
    y: number,
    radius: number,
    strength: number,
    tick: number,
    g: SkirtGround,
  ): void {
    if (radius < SKIRT_MIN_RADIUS || strength <= 0) return;
    // the ground must be close under the blast: an airburst high up raises no skirt
    const sy = surfaceNear(g, Math.round(x), y, Math.round(radius * 0.5), Math.round(radius * 1.2));
    if (sy < 0) return;
    const r = Math.min(80, radius);
    const v = 1.1 + r / 28;
    const start = r + 2;
    // each front starts on the ground just past the crater's rim, not on the crater floor
    const reach = Math.round(r);
    const ly = surfaceNear(g, Math.round(x - start), y, reach + 8, reach + 16);
    const ry = surfaceNear(g, Math.round(x + start), y, reach + 8, reach + 16);
    if (ly < 0 && ry < 0) return;
    if (this.skirts.length >= MAX_SKIRTS) this.skirts.shift();
    this.skirts.push({
      x,
      y: sy,
      r,
      start: tick,
      life: Math.round(26 + r * 0.9),
      seed: hash(tick, Math.round(x) * 7 + Math.round(y)),
      fronts: [
        { d: -start, v: -v, y: ly },
        { d: start, v, y: ry },
      ],
    });
  }

  /** One sim tick: run the fronts out and drop dust along them. */
  tick(
    t: number,
    g: SkirtGround,
    sink: ParticleSink,
    mult: number,
    air?: Pick<FluidSink, 'splat'>,
  ): void {
    if (this.skirts.length === 0) return;
    const k = Math.max(0.35, mult);
    for (const s of this.skirts) {
      const age = t - s.start;
      if (age < 0 || age >= s.life) continue;
      const fade = 1 - age / s.life;
      for (let side = 0; side < 2; side++) {
        const f = s.fronts[side]!;
        if (f.y < 0) continue;
        const dir = side === 0 ? -1 : 1;
        // advance cell by cell so the front follows the ground and stops at a wall
        const target = f.d + f.v;
        let cells = Math.floor(Math.abs(target)) - Math.floor(Math.abs(f.d));
        let x = Math.round(s.x + f.d);
        while (cells-- > 0 && f.y >= 0) {
          x += dir;
          const ny = surfaceNear(g, x, f.y, CLIMB, 12);
          if (ny < 0 || f.y - ny > CLIMB) f.y = -1;
          else f.y = ny;
        }
        if (f.y < 0) continue;
        f.d = target;
        f.v *= 0.94;
        const speed = Math.abs(f.v);
        if (speed < 0.15) {
          f.y = -1;
          continue;
        }
        const fx = s.x + f.d;
        // the bank of dust riding the front, thick at first and thinning as it brakes
        const puffs = Math.max(1, Math.round((2 + s.r / 10) * fade * k));
        for (let i = 0; i < puffs; i++) {
          const r = hash(s.seed + side * 977, age * 13 + i);
          const back = ((r >>> 4) & 7) * 0.5;
          const px = Math.round(fx - dir * back);
          const col = g.dust(px, f.y);
          sink.add({
            x: px + 0.5,
            y: f.y - 0.5 - ((r >>> 8) & 3) * 0.5,
            vx: dir * speed * (0.55 + ((r >>> 12) & 255) / 900),
            vy: -(0.04 + ((r >>> 20) & 255) / 1800) * (1 + s.r / 40),
            life: 24 + ((r >>> 24) & 31) + Math.round(s.r * 0.5),
            size: 2.5 + (s.r / 14) * fade + ((r >>> 28) & 3) * 0.5,
            color: col,
            kind: PKind.Dust,
          });
        }
        // grit flicked up off the surface as the front passes
        const rg = hash(s.seed + side * 31, age);
        if ((rg & 3) === 0 && speed > 0.5) {
          sink.add({
            x: fx + 0.5,
            y: f.y - 1,
            vx: dir * speed * 0.4,
            vy: -(0.5 + ((rg >>> 8) & 255) / 300) * Math.min(1.5, speed),
            life: 26 + ((rg >>> 16) & 15),
            size: 1,
            color: g.dust(Math.round(fx), f.y),
            kind: PKind.Chunk,
          });
        }
        // the front carries the air along with it, so the dust it drops keeps rolling
        if (air && (age & 1) === 0)
          air.splat(fx, f.y - 2, 4 + s.r / 10, dir * speed * 0.8, -0.05, 0, 0);
      }
    }
  }

  prune(t: number): void {
    if (this.skirts.length === 0) return;
    this.skirts = this.skirts.filter((s) => t - s.start < s.life);
  }

  /** Fronts still running (tests). */
  get active(): number {
    return this.skirts.length;
  }

  clear(): void {
    this.skirts = [];
  }
}

import type { EffectEvent } from '@mudders/shared';
import type { QuadBatch } from './batch';
import type { FxRng } from './gl';
import { PKind, type Particles } from './particles';

/**
 * Ion Cannon visuals (pixel renderer), for the `ionCharge` and `ionBlast` effect events.
 *
 * Charge: the beacon blinks cyan, a dashed sight line races down from the sky, a reticle closes
 * in and electric sparks are pulled into the column. Strike: a colossal beam in hard cold bands
 * (white core, ice blue, electric blue, deep violet halo, dithered edge) slams down from the top
 * of the map, energy rings racing down it, a white flare across the ground, then it lingers,
 * crackling, and pinches out to a single line. All cell-snapped, no smooth glows. The bolt storm
 * and the shockwaves around it live in the effect system.
 */

interface Charge {
  x: number;
  y: number;
  start: number;
  dur: number;
  rng: FxRng;
}

interface Beam {
  x: number;
  /** Ground row at the strike. */
  y: number;
  /** Half-width of the full beam in cells. */
  hw: number;
  start: number;
  rng: FxRng;
}

/** Ticks the beam takes to slam open, how long it holds, and how long it pinches out. */
const OPEN = 3;
const HOLD = 34;
const PINCH = 18;

/** Beam bands, outermost first: [half-width fraction, colour, alpha]. */
const BANDS: readonly (readonly [number, number, number])[] = [
  [1.15, 0x3a1890, 0.35],
  [1, 0x2c5cff, 0.6],
  [0.75, 0x58b0ff, 0.8],
  [0.5, 0xb0e8ff, 0.9],
  [0.28, 0xffffff, 1],
];

export class IonStrikes {
  private charges: Charge[] = [];
  private beams: Beam[] = [];

  constructor(private readonly particles: Particles) {}

  get active(): boolean {
    return this.charges.length > 0 || this.beams.length > 0;
  }

  charge(e: EffectEvent, rng: FxRng): void {
    this.charges.push({ x: e.x, y: e.y, start: e.tick, dur: e.params.ticks ?? 70, rng });
  }

  /** `floor` is the ground row under the strike (the crater floor once the blast has dug it). */
  fire(e: EffectEvent, rng: FxRng, floor: number): void {
    this.charges = this.charges.filter((c) => Math.abs(c.x - e.x) > 2);
    this.beams.push({
      x: Math.round(e.x),
      y: Math.round(floor),
      hw: Math.max(10, Math.round(e.radius * 0.13)),
      start: e.tick,
      rng,
    });
  }

  /**
   * Advance one tick: pull sparks into charging columns, spray sparks off the beam. Returns how
   * hard the screen should rumble (0 = no beam firing).
   */
  tick(t: number, mult: number): number {
    const P = this.particles;
    this.charges = this.charges.filter((c) => {
      const age = t - c.start;
      if (age > c.dur + 2) return false;
      const k = Math.min(1, age / c.dur);
      const n = Math.round((1 + 5 * k) * mult);
      for (let i = 0; i < n; i++) {
        const side = c.rng.next() < 0.5 ? -1 : 1;
        const d = c.rng.range(14, 60) * (1 - 0.6 * k);
        P.add({
          x: c.x + 0.5 + side * d,
          y: c.rng.range(0, c.y),
          vx: (-side * d) / 9,
          vy: 0,
          life: 9,
          size: 1,
          color: c.rng.next() < 0.35 ? 0xffffff : 0x60c0ff,
          kind: PKind.Spark,
        });
      }
      return true;
    });
    let shake = 0;
    this.beams = this.beams.filter((b) => {
      const age = t - b.start;
      if (age > OPEN + HOLD + PINCH) return false;
      if (age > OPEN + HOLD) return true;
      shake = Math.max(shake, 3);
      const r = b.rng;
      // sparks and ions blasted sideways off the foot of the beam
      const n = Math.round(10 * mult) + 2;
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        P.add({
          x: b.x + 0.5 + side * r.range(b.hw * 0.6, b.hw * 1.3),
          y: b.y - r.range(1, 6),
          vx: side * r.range(0.8, 4),
          vy: -r.range(0.6, 4.2),
          life: r.range(16, 40),
          size: r.next() < 0.25 ? 2 : 1,
          color: r.next() < 0.4 ? 0xffffff : r.next() < 0.6 ? 0x9ad8ff : 0x4a7cff,
          kind: PKind.Spark,
        });
      }
      // a few sparks crawling up the beam's skin
      for (let i = 0; i < 2; i++) {
        const side = r.next() < 0.5 ? -1 : 1;
        P.add({
          x: b.x + 0.5 + side * (b.hw + 1),
          y: r.range(0, b.y),
          vx: side * r.range(0.2, 0.8),
          vy: -r.range(0.2, 1.2),
          life: r.range(8, 16),
          size: 1,
          color: 0xd0f0ff,
          kind: PKind.Spark,
        });
      }
      return true;
    });
    return shake;
  }

  draw(add: QuadBatch, t: number): void {
    for (const c of this.charges) this.drawCharge(add, c, t);
    for (const b of this.beams) this.drawBeam(add, b, t);
  }

  private drawCharge(add: QuadBatch, c: Charge, t: number): void {
    const age = t - c.start;
    if (age < 0) return;
    const k = Math.min(1, age / c.dur);
    const x = c.x + 0.5;
    const period = k < 0.5 ? 8 : k < 0.85 ? 4 : 2;
    if (Math.floor(age / period) % 2 === 0) {
      add.push(x, c.y - 1.5, 3, 1, 0x40c8ff, 1);
      add.push(x, c.y - 1.5, 1, 3, 0x40c8ff, 1);
      add.push(x, c.y - 1.5, 1, 1, 0xffffff, 1);
    }
    if (k > 0.85) {
      // the last stretch: a solid, thickening column of light
      const w = 1 + 2 * Math.round((k - 0.85) * 20);
      add.push(x, c.y / 2, w + 4, c.y, 0x2c5cff, 0.35);
      add.push(x, c.y / 2, w, c.y, 0xd0f0ff, 0.9);
    } else if (age % 6 !== 5) {
      const dash = 6;
      const gap = 5;
      const phase = (age * 3) % (dash + gap);
      for (let y = phase - dash; y < c.y; y += dash + gap) {
        const y0 = Math.max(0, y);
        const y1 = Math.min(c.y, y + dash);
        if (y1 <= y0) continue;
        add.push(x, (y0 + y1) / 2, 1, y1 - y0, 0x50b8ff, 0.4 + 0.5 * k);
      }
    }
    // reticle: a wide ring of corner brackets closing in, then a second, tighter set
    const col = k > 0.85 ? 0xffffff : 0x60c8ff;
    const cy = c.y - 1.5;
    for (const r0 of [44, 22]) {
      const r = Math.round(r0 - (r0 - 6) * k);
      const L = r0 > 30 ? 6 : 4;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const ex = x + sx * r;
          const ey = cy + sy * r;
          add.push(ex - (sx * (L - 1)) / 2, ey, L, 1, col, 0.9);
          add.push(ex, ey - (sy * (L - 1)) / 2, 1, L, col, 0.9);
        }
      }
    }
  }

  private drawBeam(add: QuadBatch, b: Beam, t: number): void {
    const age = t - b.start;
    if (age < 0) return;
    let f = Math.min(1, (age + 1) / OPEN);
    if (age > OPEN + HOLD) f = 1 - (age - OPEN - HOLD) / PINCH;
    if (f <= 0) return;
    // flicker: the beam breathes by a cell or two from tick to tick
    const h = hash(t * 31 + b.x);
    const jit = (h & 3) === 0 ? -1 : (h & 3) === 3 ? 2 : 0;
    const w = Math.max(0.5, b.hw * f + jit);
    const x = b.x + 0.5;
    const cy = b.y / 2;
    for (const [frac, col, a] of BANDS) {
      const bw = Math.round(w * frac);
      if (bw < 0) continue;
      add.push(x, cy, bw * 2 + 1, b.y, col, a);
    }
    // energy rings racing down the beam
    const spacing = 22;
    const rw = Math.round(w * 1.15) * 2 + 3;
    for (let y = (age * 9) % spacing; y < b.y; y += spacing) {
      add.push(x, Math.floor(y) + 1, rw, 2, 0xe0f4ff, 0.6 * f);
    }
    // dithered crackle along the edges
    for (let i = 0; i < 24; i++) {
      const hh = hash(t * 97 + i * 13 + b.x * 7);
      const y = hh % Math.max(1, b.y);
      const side = (hh >> 12) & 1 ? 1 : -1;
      const out = Math.round(w * 1.15) + 1 + ((hh >> 13) & 3);
      add.push(x + side * out, y + 0.5, 1, 1, (hh >> 10) & 1 ? 0xffffff : 0x80d0ff, 0.9);
    }
    // the flare across the ground where it lands: hard bands, wide and flickering
    if (age <= OPEN + HOLD) {
      const k = age < OPEN + HOLD - 8 ? 1 : (OPEN + HOLD - age) / 8;
      const fw = Math.round((b.hw * 4 + ((h >> 4) & 7)) * k);
      add.push(x, b.y - 1, fw * 2 + 1, 2, 0x58b0ff, 0.7 * k);
      add.push(x, b.y - 1, Math.round(fw * 0.55) * 2 + 1, 3, 0xd0f0ff, 0.85 * k);
      add.push(x, b.y - 1, Math.round(b.hw * 1.4) * 2 + 1, 6, 0xffffff, k);
    }
  }

  clear(): void {
    this.charges = [];
    this.beams = [];
  }
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x5bd1e995, 0x9e3779b1);
  h ^= h >>> 15;
  return (h >>> 0) & 0xffff;
}

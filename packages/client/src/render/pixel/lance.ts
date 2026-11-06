import type { EffectEvent, EntityView } from '@mudders/shared';
import type { QuadBatch } from './batch';
import type { FxRng } from './gl';
import { PKind, type Particles } from './particles';

/**
 * Orbital Lance visuals (pixel renderer), for the `lanceCharge` and `lance` effect events.
 *
 * Lock-on: the beacon blinks, a dashed red sight line flickers down from the top of the sky and a
 * reticle closes in on it while sparks are drawn into the column. Fire: a white-hot beam in hard
 * colour bands (white core, yellow, orange, red halo, dithered edge) snaps down to the bore head,
 * with bright energy bands racing down it, molten droplets spraying out of the shaft mouth and
 * the head, then it lingers and pinches out to a single line. All cell-snapped, no smooth glows.
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
  /** Bottom of the shaft the sim will bore to, and the ground row at the column when it fired. */
  end: number;
  surface: number;
  start: number;
  /** Bore head row (from the beam's projectile while it lives). */
  head: number;
  /** Tick the head stopped (the beam went off), or -1 while boring. */
  done: number;
  rng: FxRng;
}

/** Half-width of the beam body in cells (matches the 9-cell cut). */
const HW = 9;
/** Ticks the full beam lingers after it goes off, then the ticks it takes to pinch out. */
const LINGER = 14;
const PINCH = 12;

/** Beam bands, outermost first: [half-width offset from HW, colour, alpha]. */
const BANDS: readonly (readonly [number, number, number])[] = [
  [2, 0xb01800, 0.35],
  [0, 0xff4a10, 0.6],
  [-2, 0xff9a28, 0.8],
  [-4, 0xffe070, 0.9],
  [-5, 0xffffff, 1],
];

export class Lances {
  private charges: Charge[] = [];
  private beams: Beam[] = [];

  constructor(private readonly particles: Particles) {}

  get active(): boolean {
    return this.charges.length > 0 || this.beams.length > 0;
  }

  charge(e: EffectEvent, rng: FxRng): void {
    this.charges.push({ x: e.x, y: e.y, start: e.tick, dur: e.params.ticks ?? 60, rng });
  }

  fire(e: EffectEvent, rng: FxRng): void {
    this.charges = this.charges.filter((c) => c.x !== e.x);
    this.beams.push({
      x: e.x,
      end: e.y,
      surface: e.params.surface ?? e.y,
      start: e.tick,
      head: 0,
      done: -1,
      rng,
    });
  }

  /** Follow each boring beam's head from its projectile; when that is gone the beam went off. */
  track(entities: readonly EntityView[], tick: number): void {
    for (const b of this.beams) {
      if (b.done >= 0 || tick <= b.start) continue;
      let found = false;
      for (const e of entities) {
        if (e.kind !== 'projectile' || Math.floor(e.x) !== b.x) continue;
        if (e.y < b.head - 1) continue;
        b.head = e.y;
        found = true;
        break;
      }
      if (!found) b.done = tick;
    }
  }

  /** True for a projectile that is a fired lance's head: drawn as the beam, not as a shell. */
  owns(x: number, y: number): boolean {
    for (const b of this.beams) {
      if (b.done < 0 && Math.floor(x) === b.x && y >= b.head - 1) return true;
    }
    return false;
  }

  /**
   * Advance one tick: spawn sparks and molten spray. Returns how hard the screen should shake
   * (0 = no lance firing) so the effect system can keep it rumbling.
   */
  tick(t: number, mult: number): number {
    const P = this.particles;
    this.charges = this.charges.filter((c) => {
      const age = t - c.start;
      if (age > c.dur + 2) return false;
      // energy gathering into the column: sparks drawn sideways into the sight line
      const k = Math.min(1, age / c.dur);
      const n = Math.round((1 + 3 * k) * mult);
      for (let i = 0; i < n; i++) {
        const side = c.rng.next() < 0.5 ? -1 : 1;
        const d = c.rng.range(10, 34) * (1 - 0.5 * k);
        const y = c.rng.range(0, c.y);
        P.add({
          x: c.x + 0.5 + side * d,
          y,
          vx: (-side * d) / 10,
          vy: 0,
          life: 10,
          size: 1,
          color: c.rng.next() < 0.3 ? 0xffffff : 0xff4040,
          kind: PKind.Spark,
        });
      }
      return true;
    });
    let shake = 0;
    this.beams = this.beams.filter((b) => {
      const age = t - b.start;
      const off = b.done >= 0 ? t - b.done : 0;
      if (off > LINGER + PINCH) return false;
      const r = b.rng;
      if (b.done < 0 || off < LINGER) {
        shake = Math.max(shake, b.done < 0 ? 2 : 1.2);
        // molten spray out of the shaft mouth, arcing out both ways
        if (b.head >= b.surface - 1) {
          const n = Math.round(6 * mult) + 1;
          for (let i = 0; i < n; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            P.add({
              x: b.x + 0.5 + side * r.range(HW - 2, HW + 2),
              y: b.surface - 1,
              vx: side * r.range(0.4, 2.2),
              vy: -r.range(1.2, 3.6),
              life: r.range(18, 40),
              size: r.next() < 0.3 ? 1.5 : 1,
              color: r.next() < 0.35 ? 0xfff0a0 : r.next() < 0.6 ? 0xffa030 : 0xff5a18,
              kind: PKind.Spark,
            });
          }
          if (age % 3 === 0) {
            P.add({
              x: b.x + 0.5 + r.range(-HW, HW),
              y: b.surface - 2,
              vx: r.range(-0.3, 0.3),
              vy: -r.range(0.3, 0.8),
              life: r.range(50, 90),
              size: r.range(4, 8),
              color: r.next() < 0.5 ? 0x3a3034 : 0x5a4e50,
              kind: PKind.Smoke,
            });
          }
        }
        // sparks off the bore head while it is still cutting
        if (b.done < 0 && b.head > 0) {
          const n = Math.round(4 * mult) + 1;
          for (let i = 0; i < n; i++) {
            P.add({
              x: b.x + 0.5 + r.range(-HW, HW),
              y: b.head,
              vx: r.range(-1.2, 1.2),
              vy: -r.range(0.5, 2.5),
              life: r.range(8, 18),
              size: 1,
              color: r.next() < 0.5 ? 0xffffff : 0xffd060,
              kind: PKind.Spark,
            });
          }
        }
      } else if (age % 4 === 0) {
        // the shaft steams once the beam is out
        P.add({
          x: b.x + 0.5 + r.range(-3, 3),
          y: b.surface - 1,
          vx: r.range(-0.15, 0.15),
          vy: -r.range(0.3, 0.6),
          life: r.range(60, 110),
          size: r.range(3, 6),
          color: 0x6a6266,
          kind: PKind.Smoke,
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
    // beacon: a blinking red pixel cross, blinking faster as the lock closes
    const period = k < 0.5 ? 8 : k < 0.85 ? 4 : 2;
    if (Math.floor(age / period) % 2 === 0) {
      add.push(x, c.y - 1.5, 3, 1, 0xff3030, 1);
      add.push(x, c.y - 1.5, 1, 3, 0xff3030, 1);
      add.push(x, c.y - 1.5, 1, 1, 0xffffff, 1);
    }
    // sight line: dashes racing down from the sky, solid and hotter for the last stretch
    if (k > 0.85) {
      add.push(x, c.y / 2, 3, c.y, 0xff2a10, 0.35);
      add.push(x, c.y / 2, 1, c.y, 0xffe0d0, 0.9);
    } else if (age % 6 !== 5) {
      const dash = 6;
      const gap = 5;
      const phase = (age * 3) % (dash + gap);
      for (let y = phase - dash; y < c.y; y += dash + gap) {
        const y0 = Math.max(0, y);
        const y1 = Math.min(c.y, y + dash);
        if (y1 <= y0) continue;
        add.push(x, (y0 + y1) / 2, 1, y1 - y0, 0xff3030, 0.4 + 0.5 * k);
      }
    }
    // reticle: four pixel corner brackets closing in on the beacon
    const r = Math.round(26 - 18 * k);
    const L = 4;
    const col = k > 0.85 ? 0xffffff : 0xff4040;
    const cy = c.y - 1.5;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const ex = x + sx * r;
        const ey = cy + sy * r;
        add.push(ex - (sx * (L - 1)) / 2, ey, L, 1, col, 0.9);
        add.push(ex, ey - (sy * (L - 1)) / 2, 1, L, col, 0.9);
      }
    }
  }

  private drawBeam(add: QuadBatch, b: Beam, t: number): void {
    const age = t - b.start;
    if (age < 0) return;
    const off = b.done >= 0 ? Math.max(0, t - b.done) : 0;
    // width: snaps open over 3 ticks, holds, then pinches to a line and out
    let w = HW * Math.min(1, (age + 1) / 3);
    if (off > LINGER) w = HW * (1 - (off - LINGER) / PINCH);
    if (w <= 0) return;
    // flicker: the beam breathes by a whole cell from tick to tick
    const h = hash(t * 31 + b.x);
    w = Math.max(0.5, Math.round(w + ((h & 3) === 0 ? -1 : (h & 3) === 3 ? 1 : 0)));
    const head = Math.max(1, Math.round(b.head));
    const x = b.x + 0.5;
    const cy = head / 2;
    const k = w / HW;
    for (const [dw, col, a] of BANDS) {
      const bw = Math.round(w + dw * k);
      if (bw < 0) continue;
      add.push(x, cy, bw * 2 + 1, head, col, a);
    }
    // energy bands racing down the beam
    const spacing = 18;
    for (let y = (age * 7) % spacing; y < head; y += spacing) {
      add.push(x, Math.floor(y) + 1, Math.round(w) * 2 + 3, 2, 0xffffff, 0.55);
    }
    // dithered sparkle along the edges
    for (let i = 0; i < 10; i++) {
      const hh = hash(t * 97 + i * 13 + b.x * 7);
      const y = hh % head;
      const side = (hh >> 12) & 1 ? 1 : -1;
      add.push(x + side * (Math.round(w) + 2 + ((hh >> 13) & 1)), y + 0.5, 1, 1, 0xffd080, 0.9);
    }
    // the bore head and the flare across the shaft mouth: hard bands
    if (b.done < 0 || off < LINGER) {
      const f = b.done < 0 ? 1 : 1 - off / LINGER;
      add.push(x, head, (HW + 4) * 2 + 1, 5, 0xff7a20, 0.7 * f);
      add.push(x, head, HW * 2 + 1, 3, 0xffffff, f);
      if (head >= b.surface - 1) {
        const fw = Math.round((HW * 5 + ((h >> 4) & 3)) * f);
        add.push(x, b.surface - 1, fw * 2 + 1, 1, 0xffc060, 0.75 * f);
        add.push(x, b.surface - 1, Math.round(fw * 0.5) * 2 + 1, 2, 0xffffff, 0.85 * f);
      }
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

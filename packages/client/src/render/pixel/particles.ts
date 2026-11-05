import { Shape, type QuadBatch } from './batch';

/**
 * Cosmetic particles (§2a): sparks, dirt chunks, smoke and dust. Purely visual and never fed back
 * into the sim (particles that become terrain are sim debris). Struct-of-arrays in typed arrays,
 * fixed capacity per quality level; stepped once per sim tick so captures replay exactly.
 */
export const PKind = {
  /** Additive, bright, falls. */
  Spark: 0,
  /** Opaque square cell, falls and fades. */
  Chunk: 1,
  /** Soft puff, rises slowly, grows. */
  Smoke: 2,
  /** Soft puff hugging the ground, no gravity. */
  Dust: 3,
} as const;
export type PKind = (typeof PKind)[keyof typeof PKind];

export interface Emit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: number;
  kind: PKind;
}

export class Particles {
  readonly cap: number;
  n = 0;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly color: Uint32Array;
  private readonly kind: Uint8Array;

  constructor(cap: number) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.color = new Uint32Array(cap);
    this.kind = new Uint8Array(cap);
  }

  /** Add a particle; when full, the oldest slot is reused (cosmetic, so dropping is fine). */
  add(e: Emit): void {
    let i = this.n;
    if (i >= this.cap) {
      // replace the particle closest to the end of its life
      let best = 0;
      let bestLeft = Infinity;
      for (let j = 0; j < this.n; j += 7) {
        const left = this.life[j]! - this.age[j]!;
        if (left < bestLeft) {
          bestLeft = left;
          best = j;
        }
      }
      i = best;
    } else {
      this.n++;
    }
    this.x[i] = e.x;
    this.y[i] = e.y;
    this.vx[i] = e.vx;
    this.vy[i] = e.vy;
    this.age[i] = 0;
    this.life[i] = e.life;
    this.size[i] = e.size;
    this.color[i] = e.color;
    this.kind[i] = e.kind;
  }

  /** One sim tick of cosmetic motion. */
  step(gravity: number, wind: number): void {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i]! + 1;
      if (a >= this.life[i]!) continue;
      const k = this.kind[i]!;
      let vx = this.vx[i]!;
      let vy = this.vy[i]!;
      if (k === PKind.Spark) {
        vy += gravity * 0.6;
        vx *= 0.97;
        vy *= 0.97;
      } else if (k === PKind.Chunk) {
        vy += gravity;
        vx *= 0.99;
      } else if (k === PKind.Smoke) {
        vy = vy * 0.94 - 0.012;
        vx = vx * 0.94 + wind * 4;
      } else {
        vx *= 0.9;
        vy = vy * 0.9 - 0.004;
      }
      this.x[w] = this.x[i]! + vx;
      this.y[w] = this.y[i]! + vy;
      this.vx[w] = vx;
      this.vy[w] = vy;
      this.age[w] = a;
      this.life[w] = this.life[i]!;
      this.size[w] = this.size[i]!;
      this.color[w] = this.color[i]!;
      this.kind[w] = k;
      w++;
    }
    this.n = w;
  }

  /** Push into the normal-blend batch (chunks, smoke, dust) and the additive batch (sparks). */
  draw(normal: QuadBatch, additive: QuadBatch): void {
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i]! / this.life[i]!;
      const k = this.kind[i]!;
      const s = this.size[i]!;
      const c = this.color[i]!;
      if (k === PKind.Spark) {
        // one bright cell, snapped to the grid
        const fade = t < 0.6 ? 1 : (1 - t) / 0.4;
        additive.push(Math.floor(this.x[i]!) + 0.5, Math.floor(this.y[i]!) + 0.5, 1, 1, c, fade);
      } else if (k === PKind.Chunk) {
        normal.push(
          Math.floor(this.x[i]!) + 0.5,
          Math.floor(this.y[i]!) + 0.5,
          s,
          s,
          c,
          t < 0.7 ? 1 : (1 - t) / 0.3,
        );
      } else {
        const grow = k === PKind.Smoke ? 1 + t * 2.2 : 1 + t * 1.4;
        const alpha = (k === PKind.Smoke ? 0.5 : 0.42) * (1 - t) * Math.min(1, t * 6 + 0.2);
        normal.push(this.x[i]!, this.y[i]!, s * grow, s * grow, c, alpha, Shape.Pixel);
      }
    }
  }

  clear(): void {
    this.n = 0;
  }
}

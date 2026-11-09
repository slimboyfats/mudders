import { Shape, type QuadBatch } from './batch';
import { shade } from './theme';

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
  /** Fire: a solid pixel blob that rises, steps yellow → orange → red → soot in hard bands and
   * shrinks out. Its own colour is ignored. */
  Flame: 4,
  /** One opaque cell drifting slowly down, swaying on the wind (snowflakes). */
  Snow: 5,
  /** A gust of wind: a thin horizontal dash of `size` cells sailing across the sky, no gravity. */
  Streak: 6,
  /**
   * A firework star: an additive cell that flies out fast, brakes hard in the air, droops, and
   * strobes on and off as it burns out.
   */
  Glitter: 7,
  /**
   * A smoke-column puff: rises steadily, slows and spreads as it ages, and leans further downwind
   * the older (higher) it gets, so a stream of them reads as a column bending in the wind. Its own
   * colour is the young tone; it steps lighter in hard bands as it thins out.
   */
  Plume: 8,
  /**
   * A mushroom-cloud mote: one cell of a big cloud, coloured by the emitter (heat ramp), carried
   * along by its own velocity and the swirl field, thinning out cell by cell. GPU engine only.
   */
  Cloud: 9,
  /** A glowing ember shed by fire: floats up on the heat, drifts and flickers out. GPU only. */
  Ember: 10,
  /** A flake of ash: sails down slowly on the wind, swaying, and settles. GPU only. */
  Ash: 11,
  /** A raindrop: a streak falling fast, leaning with the wind, that splashes where it lands. GPU only. */
  Rain: 12,
  /** A weather snowflake: heavier than frost, swings in the wind, settles on the ground. GPU only. */
  Flake: 13,
  /**
   * Energy plasma (shockwave rings): a puff that breaks into single-cell motes, torn into wisps by
   * a strong swirl, stepping from a hot cyan-white through its own colour to deep violet and
   * winking out cell by cell. No gravity. GPU only (the CPU model draws it as dust).
   */
  Plasma: 14,
} as const;
export type PKind = (typeof PKind)[keyof typeof PKind];

/** Plume alpha per life band when drawn dithered (fresh puffs and the thinning top). */
const PLUME_ALPHA = [0.6, 0.6, 0.6, 0.55, 0.3] as const;

/** Flame particle colour bands over its life. */
const FLAME_RAMP = [0xfff0a0, 0xffa020, 0xe04a10, 0x3a2a26] as const;

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

/** Anything particles can be spawned into: the GPU engine in the renderer, this CPU model in tests. */
export interface ParticleSink {
  add(e: Emit): void;
}

/**
 * CPU reference model of the particle kinds. The renderer draws with the GPU engine
 * (`gpu-particles.ts`); this stays for tests and as the readable spec of each kind's look.
 */
export class Particles implements ParticleSink {
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
      } else if (k === PKind.Glitter) {
        vy += gravity * 0.25;
        vx *= 0.93;
        vy *= 0.93;
      } else if (k === PKind.Chunk) {
        vy += gravity;
        vx *= 0.99;
      } else if (k === PKind.Snow) {
        vy = Math.min(vy + gravity * 0.04, 0.32);
        vx = vx * 0.95 + wind * 3 + Math.sin(a * 0.11 + i * 1.7) * 0.012;
      } else if (k === PKind.Streak) {
        vx += wind * 2;
        vy *= 0.9;
      } else if (k === PKind.Smoke) {
        vy = vy * 0.94 - 0.012;
        vx = vx * 0.94 + wind * 4;
      } else if (k === PKind.Plume) {
        // buoyant while young, then hangs; the wind takes it harder the higher it climbs
        const t = a / this.life[i]!;
        vy = vy * 0.985 - 0.0036 * (1 - t);
        vx = vx * 0.985 + wind * (0.25 + t * 1.1);
      } else if (k === PKind.Flame) {
        vy = vy * 0.95 - 0.02;
        vx = vx * 0.92 + wind * 3;
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
      } else if (k === PKind.Glitter) {
        // full on, then strobing in whole ticks as it burns out
        if (t > 0.55 && ((this.age[i]! + (c & 7)) & 2) === 0) continue;
        const x = Math.floor(this.x[i]!) + 0.5;
        const y = Math.floor(this.y[i]!) + 0.5;
        additive.push(x, y, s, s, c, t < 0.55 ? 1 : 0.85);
      } else if (k === PKind.Snow) {
        normal.push(
          Math.floor(this.x[i]!) + 0.5,
          Math.floor(this.y[i]!) + 0.5,
          s,
          s,
          c,
          t < 0.8 ? 0.95 : (1 - t) / 0.2,
        );
      } else if (k === PKind.Streak) {
        // a hard-edged dash on the cell grid, fading in and out in bands
        const a = t < 0.2 ? 0.3 : t < 0.75 ? 0.62 : 0.3;
        const len = Math.max(2, Math.round(s));
        normal.push(Math.floor(this.x[i]!) + len / 2, Math.floor(this.y[i]!) + 0.5, len, 1, c, a);
      } else if (k === PKind.Chunk) {
        normal.push(
          Math.floor(this.x[i]!) + 0.5,
          Math.floor(this.y[i]!) + 0.5,
          s,
          s,
          c,
          t < 0.7 ? 1 : (1 - t) / 0.3,
        );
      } else if (k === PKind.Plume) {
        const band = Math.min(4, Math.floor(t * 5));
        // spreads out as it climbs; whole-cell sizes so the blob edge stays crisp
        const sz = Math.round(s * (1 + t * 2.4));
        const col = band < 2 ? c : shade(c, band === 2 ? 1.2 : band === 3 ? 1.4 : 1.55);
        // dense smoke as opaque cell blobs in flat tones (like the clouds); thinning smoke as a
        // dithered blob, so the whole column stays hard-edged pixels
        const solid = band < 3 && this.age[i]! >= 6;
        normal.push(
          Math.floor(this.x[i]!) + 0.5,
          Math.floor(this.y[i]!) + 0.5,
          sz,
          sz,
          col,
          solid ? 1 : PLUME_ALPHA[band]!,
          solid ? Shape.Solid : Shape.Pixel,
        );
      } else if (k === PKind.Flame) {
        const band = Math.min(3, Math.floor(t * 4));
        const sz = Math.max(1, Math.round(s * (1 - t * 0.6)));
        const x = Math.floor(this.x[i]!) + 0.5;
        const y = Math.floor(this.y[i]!) + 0.5;
        normal.push(x, y, sz, sz, FLAME_RAMP[band]!, band === 3 ? 0.7 : 1, Shape.Pixel);
        if (band < 2) additive.push(x, y, Math.max(1, sz - 2), Math.max(1, sz - 2), 0xffd060, 0.5);
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

/**
 * The air, as the effects see it: the smoke fluid plus the pixels that show it.
 *
 * The fluid (`fluid.ts`) is only a velocity field with heat in it; nothing of it is painted as
 * smoke. What you see is single cells: every bit of soot, steam or fire poured into the air is
 * also spawned as {@link PKind.Wisp} and {@link PKind.Fire} particles that the GPU engine moves
 * with the fluid's velocity. So smoke is a fluid (it rolls, curls round vortices, pools under
 * overhangs, pours out of craters) and is still made of pixels.
 */
import type { FluidSink } from './fluid';
import { PKind, type ParticleSink } from './particles';

/** Soot tones a wisp starts from; it steps darker-to-paler over its life on its own. */
const SOOT_TONES = [0x5c5458, 0x6e666a, 0x4a4246, 0x7c7478] as const;
/** Sick greens of a gas cloud. */
const GAS_TONES = [0x4f8a3b, 0x7ab84a, 0x2c5929, 0x63a043] as const;

export class PixelAir implements FluidSink {
  /** Fractions of a wisp owed from earlier splats, so thin sources still smoke steadily. */
  private owed = 0;
  private owedGas = 0;
  private seed = 0x2545f491;

  constructor(
    private readonly fluid: FluidSink | null,
    private readonly particles: ParticleSink,
    /** Particle density for the quality level (1 = full). */
    private readonly mult: number,
  ) {}

  /** A small deterministic generator: the same splats always give the same pixels. */
  private rand(): number {
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s;
    return (s >>> 0) / 4294967296;
  }

  splat(
    x: number,
    y: number,
    r: number,
    vx: number,
    vy: number,
    smoke: number,
    heat: number,
    gas = 0,
    radial = false,
    fire = 0,
  ): void {
    this.fluid?.splat(x, y, r, vx, vy, smoke, heat, gas, radial, fire);
    if (gas > 0) this.gas(x, y, r, vx, vy, gas);
    if (smoke <= 0) return;
    // as many cells as the soot would have covered
    this.owed += smoke * r * 4 * Math.max(0.35, this.mult);
    const n = Math.floor(this.owed);
    this.owed -= n;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * 6.283185;
      const d = Math.sqrt(this.rand()) * r * 0.7;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const out = radial ? vx * 0.5 : 0;
      this.particles.add({
        x: x + ux * d,
        y: y + uy * d,
        vx: (radial ? 0 : vx * 0.5) + ux * out + (this.rand() - 0.5) * 0.2,
        vy: (radial ? 0 : vy * 0.5) + uy * out + (this.rand() - 0.5) * 0.2,
        life: 160 + this.rand() * 240,
        size: 1,
        color: SOOT_TONES[Math.floor(this.rand() * SOOT_TONES.length)]!,
        kind: PKind.Wisp,
      });
    }
  }

  /** Gas poured in as single cells, spread over the whole splat so a cloud has no bright core. */
  private gas(x: number, y: number, r: number, vx: number, vy: number, amount: number): void {
    this.owedGas += amount * r * 5 * Math.max(0.35, this.mult);
    const n = Math.floor(this.owedGas);
    this.owedGas -= n;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * 6.283185;
      const d = Math.sqrt(this.rand()) * r;
      this.particles.add({
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d * 0.7,
        vx: vx * 0.3 + (this.rand() - 0.5) * 0.3,
        vy: vy * 0.3 + (this.rand() - 0.5) * 0.3,
        life: 150 + this.rand() * 200,
        size: 1,
        color: GAS_TONES[Math.floor(this.rand() * GAS_TONES.length)]!,
        kind: PKind.Gas,
      });
    }
  }

  /**
   * A standing gas cloud (the sim's puffs, x/y pairs) kept filled with cells: each lives a
   * second or two and drifts on the air, and new ones keep welling up at the puffs, so the
   * cloud follows the sim while every pixel of it moves like gas. Dark and dense at the puff
   * hearts, pale and thin at the rim.
   */
  cloud(
    puffs: ArrayLike<number>,
    r: number,
    thin: number,
    tones: readonly [number, number, number, number],
    solid: (x: number, y: number) => boolean,
  ): void {
    const n = puffs.length >> 1;
    if (n === 0) return;
    // enough to keep about two cells in three of the cloud filled, whatever its size
    const live = Math.min(14000, n * r * r * 2.2) * Math.max(0.35, this.mult) * thin;
    this.owedGas += live / 85;
    const k = Math.floor(this.owedGas);
    this.owedGas -= k;
    for (let i = 0; i < k; i++) {
      const p = Math.floor(this.rand() * n);
      const a = this.rand() * 6.283185;
      const q = this.rand();
      const d = Math.sqrt(q) * r;
      const x = puffs[2 * p]! + 0.5 + Math.cos(a) * d;
      // flatter than round, and sat on the ground: most of a puff is above its centre
      const y = puffs[2 * p + 1]! + 0.5 - r * 0.35 + Math.sin(a) * d * 0.8;
      if (solid(Math.floor(x), Math.floor(y))) continue;
      this.particles.add({
        x,
        y,
        vx: (this.rand() - 0.5) * 0.25,
        vy: (this.rand() - 0.5) * 0.2 - 0.03,
        life: 50 + this.rand() * 70,
        size: 1,
        color: tones[q < 0.4 ? 0 : q < 0.72 ? 1 : q < 0.9 ? 2 : 3]!,
        kind: PKind.Gas,
      });
    }
  }

  swirl(x: number, y: number, r: number, spin: number): void {
    this.fluid?.swirl?.(x, y, r, spin);
  }
}

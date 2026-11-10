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

export class PixelAir implements FluidSink {
  /** Fractions of a wisp owed from earlier splats, so thin sources still smoke steadily. */
  private owed = 0;
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

  swirl(x: number, y: number, r: number, spin: number): void {
    this.fluid?.swirl?.(x, y, r, spin);
  }
}

import { describe, expect, it } from 'vitest';
import type { EffectEvent } from '@mudders/shared';
import { birdHit, birdPulp, drawBirds, wingFrame } from './birds';
import { PKind, type Emit, type ParticleSink } from './particles';

class Sink implements ParticleSink {
  readonly out: Emit[] = [];
  add(e: Emit): void {
    this.out.push(e);
  }
}

const ev = (type: string, params: Record<string, number>): EffectEvent => ({
  type,
  tick: 40,
  x: 300,
  y: 60,
  radius: 2,
  params,
});

const luma = (c: number): number => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);

describe('swallow looks', () => {
  it('draw each sim bird as a handful of cells around its position', () => {
    const cells: { x: number; y: number; c: number }[] = [];
    const batch = {
      push: (x: number, y: number, _w: number, _h: number, c: number) => cells.push({ x, y, c }),
    };
    // two birds: x, y, vx, vy (1/256 cell), panic
    drawBirds(
      batch as never,
      [100 * 256, 50 * 256, 256, 0, 0, 200 * 256, 80 * 256, -256, 0, 30],
      7,
      false,
    );
    expect(cells.length).toBeGreaterThanOrEqual(14);
    for (const p of cells) {
      const near = Math.abs(p.x - 100.5) <= 2 || Math.abs(p.x - 200.5) <= 2;
      expect(near).toBe(true);
    }
  });

  it('pale wings under a night sky, dark ones by day', () => {
    const at = (night: boolean): number[] => {
      const cs: number[] = [];
      drawBirds(
        {
          push: (_x: number, _y: number, _w: number, _h: number, c: number) => cs.push(c),
        } as never,
        [0, 0, 1, 0, 0],
        0,
        night,
      );
      return cs;
    };
    expect(Math.max(...at(true).map(luma))).toBeGreaterThan(Math.max(...at(false).map(luma)));
  });

  it('flap in bursts and glide between', () => {
    const frames = new Set<number>();
    for (let t = 0; t < 200; t++) frames.add(wingFrame(0, t, 0, false));
    expect(frames.size).toBe(4);
  });

  it('a shell hit throws feathers; a pressure front bursts the bird into black pixels', () => {
    const hit = new Sink();
    birdHit(ev('birdHit', { vx: 300, vy: -100 }), hit);
    expect(hit.out.filter((e) => e.kind === PKind.Leaf).length).toBeGreaterThanOrEqual(6);
    const pulp = new Sink();
    birdPulp(ev('birdPulp', { ox: 300, oy: 200, near: 800 }), pulp);
    expect(pulp.out.length).toBeGreaterThanOrEqual(14);
    // black: no bright pixels, and flung away from the blast below (upward)
    for (const e of pulp.out) expect(luma(e.color)).toBeLessThan(3 * 0x40);
    expect(pulp.out.filter((e) => e.vy < 0).length).toBeGreaterThan(pulp.out.length / 2);
  });
});

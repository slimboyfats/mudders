import type { EntityView } from '@mudders/shared';
import { describe, expect, it } from 'vitest';
import { WaterFx, bounce } from './splash';

const W = 60;
const H = 40;
const WATER = 19;
const DIRT = 1;

/** Flat dirt from row 30, with a pool of water rows 25–29 between columns 10 and 49. */
function pond(): Uint8Array {
  const t = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y >= 30 || ((x < 10 || x >= 50) && y >= 25)) t[y * W + x] = DIRT;
      else if (y >= 25) t[y * W + x] = WATER;
    }
  }
  return t;
}

function shell(id: number, x: number, y: number): EntityView {
  return { kind: 'projectile', id, weapon: 'weapon.missile', x, y };
}

function fx(terrain: Uint8Array): WaterFx {
  const colors = new Uint32Array(256);
  colors[WATER] = 0x3a78c8;
  const f = new WaterFx(W, H, [WATER], colors);
  f.setTerrain(terrain);
  return f;
}

/** Count of quads the water effects would draw. */
function quads(f: WaterFx, t: number): number {
  let n = 0;
  const batch = { push: () => n++ };
  f.draw(batch as never, t);
  return n;
}

describe('water splashes', () => {
  it('bounces a wave front between the banks', () => {
    expect(bounce(3, 10)).toEqual({ pos: 3, hits: 0 });
    expect(bounce(13, 10)).toEqual({ pos: 7, hits: 1 });
    expect(bounce(23, 10)).toEqual({ pos: 3, hits: 2 });
  });

  it('splashes and cues a sound when a shell plunges into a pool', () => {
    const f = fx(pond());
    f.tick([shell(1, 30, 18)], 0);
    f.tick([shell(1, 31, 24)], 1);
    expect(quads(f, 1)).toBe(0);
    f.tick([shell(1, 32, 29)], 2);
    expect(quads(f, 2)).toBeGreaterThan(10);
    const cues = f.drainCues();
    expect(cues).toHaveLength(1);
    expect(cues[0]!.type).toBe('waterSplash');
    expect(f.drainCues()).toHaveLength(0);
  });

  it('stays dry when a shell lands on ground', () => {
    const f = fx(pond());
    f.tick([shell(1, 5, 18)], 0);
    f.tick([shell(1, 5, 24)], 1);
    f.tick([], 2);
    expect(quads(f, 2)).toBe(0);
    expect(f.drainCues()).toHaveLength(0);
  });

  it('throws spray off a pool next to a big blast', () => {
    const f = fx(pond());
    f.blast({ type: 'flash', tick: 0, x: 30, y: 26, radius: 10, params: {} });
    expect(quads(f, 0)).toBeGreaterThan(10);
  });

  it('is a pure function of the snapshots (same inputs, same frames)', () => {
    const run = (): number[] => {
      const f = fx(pond());
      const out: number[] = [];
      f.tick([shell(1, 20, 10)], 0);
      f.tick([shell(1, 22, 22)], 1);
      for (let t = 2; t < 60; t++) {
        f.tick([], t);
        out.push(quads(f, t));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('ripples die down and the spray settles', () => {
    const f = fx(pond());
    f.tick([shell(1, 30, 18)], 0);
    f.tick([shell(1, 32, 29)], 1);
    for (let t = 2; t < 400; t++) f.tick([], t);
    expect(quads(f, 400)).toBe(0);
  });
});

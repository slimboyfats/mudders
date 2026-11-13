import { describe, expect, it } from 'vitest';
import { TANK_HALF } from '@mudders/sim';
import { makeWorld } from '../../../src/testing';

describe('gen.hills', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = makeWorld({ seed: 11 });
    const b = makeWorld({ seed: 11 });
    const c = makeWorld({ seed: 12 });
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });

  it('places every tank on the surface, spread out and inside the map', () => {
    for (const players of [2, 3, 4]) {
      const w = makeWorld({ seed: players, players });
      const xs = w.tanks.map((t) => t.x).sort((p, q) => p - q);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(100);
      for (const t of w.tanks) {
        expect(t.x).toBeGreaterThanOrEqual(TANK_HALF);
        expect(t.x).toBeLessThan(w.grid.width - TANK_HALF);
        expect(w.grid.surfaceY(t.x)).toBeGreaterThanOrEqual(t.y);
        expect(t.falling).toBe(false);
      }
      w.run(5);
      expect(w.tanks.every((t) => !t.falling)).toBe(true);
    }
  });

  it('uses all three materials and starts settled', () => {
    const w = makeWorld({ seed: 3 });
    const seen = new Set(w.grid.material);
    for (const id of ['material.dirt', 'material.sand', 'material.rock']) {
      expect(seen.has(w.mats.cellOf(id))).toBe(true);
    }
    expect(w.grid.settling).toBe(false);
  });
});

describe('big landforms', () => {
  it('every landform reshapes the hills, the same way for the same seed', async () => {
    const { landform, LANDFORMS } = await import('./behaviour');
    const { Prng } = await import('@mudders/sim');
    const seen = new Set<number>();
    for (let seed = 1; seed < 60 && seen.size < LANDFORMS.length; seed++) {
      const flat = new Int32Array(800).fill(240);
      const a = Int32Array.from(flat);
      const b = Int32Array.from(flat);
      const k = landform(new Prng(seed), a, 800, 400);
      expect(landform(new Prng(seed), b, 800, 400)).toBe(k);
      expect(a).toEqual(b);
      // a plain on flat ground stays flat; every other landform moves the ground
      if (LANDFORMS[k] !== 'plain') expect(a.some((y) => y !== 240)).toBe(true);
      seen.add(k);
    }
    expect(seen.size).toBe(LANDFORMS.length);
  });
});

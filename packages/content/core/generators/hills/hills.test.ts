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

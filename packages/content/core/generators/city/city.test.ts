import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('gen.city', () => {
  it('builds towers and blocks clear of the tanks, deterministically, for 2 to 8 players', () => {
    for (const [seed, players] of [
      [1, 2],
      [2, 4],
      [3, 8],
    ] as const) {
      const opts = { seed, players, map: { generator: 'gen.city', width: 1200, height: 600 } };
      const a = makeWorld(opts);
      expect(a.hash()).toBe(makeWorld(opts).hash());
      const concrete = a.mats.cellOf('material.concrete');
      let n = 0;
      for (const c of a.grid.material) if (c === concrete) n++;
      expect(n).toBeGreaterThan(players === 8 ? 300 : 2000);
      const g = a.grid;
      for (const t of a.tanks) {
        for (let x = t.x - t.half - 2; x < t.x + t.half + 2; x++) {
          for (let y = 0; y < g.height; y++) expect(g.group[y * g.width + x]).toBe(0);
        }
      }
      expect(a.quiet).toBe(true);
    }
  });
});

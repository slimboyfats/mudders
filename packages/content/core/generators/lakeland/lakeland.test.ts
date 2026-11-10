import { describe, expect, it } from 'vitest';
import { countCells, makeWorld } from '../../../src/testing';

describe('gen.lakeland', () => {
  it('fills the valleys with lakes that are still at round start, deterministically', () => {
    for (const seed of [1, 2, 3]) {
      const opts = {
        seed,
        players: 4,
        map: { generator: 'gen.lakeland', width: 1200, height: 600 },
      };
      const a = makeWorld(opts);
      expect(a.hash()).toBe(makeWorld(opts).hash());
      expect(countCells(a, 'material.water')).toBeGreaterThan(1500);
      expect(a.quiet).toBe(true);
      // no tank starts under water
      const water = a.mats.cellOf('material.water');
      for (const t of a.tanks) {
        for (let y = t.y - t.h; y <= t.y; y++) expect(a.grid.get(t.x, y)).not.toBe(water);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, makeWorld } from '../../../src/testing';

describe('gen.claypits', () => {
  it('lays a clay bed, bare in the valleys, deterministically, and starts quiet', () => {
    for (const seed of [1, 2, 3]) {
      const opts = {
        seed,
        players: 4,
        map: { generator: 'gen.claypits', width: 1200, height: 600 },
      };
      const a = makeWorld(opts);
      expect(a.hash()).toBe(makeWorld(opts).hash());
      expect(countCells(a, 'material.clay')).toBeGreaterThan(10000);
      // some columns show clay right at the surface
      const clay = a.mats.cellOf('material.clay');
      let bare = 0;
      for (let x = 0; x < a.grid.width; x++) if (a.grid.get(x, a.grid.surfaceY(x)) === clay) bare++;
      expect(bare).toBeGreaterThan(50);
      expect(a.quiet).toBe(true);
    }
  });

  it('gen.hills itself has no clay', () => {
    const w = makeWorld({ seed: 1, map: { generator: 'gen.hills', width: 1200, height: 600 } });
    expect(countCells(w, 'material.clay')).toBe(0);
  });
});

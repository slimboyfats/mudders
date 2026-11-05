import { describe, expect, it } from 'vitest';
import { TANK_HALF } from '@mudders/sim';
import { makeWorld } from '../../../src/testing';

describe('gen.village', () => {
  it('places houses, trees and boulders clear of the tanks, deterministically', () => {
    for (const seed of [1, 2, 3]) {
      const opts = {
        seed,
        players: 4,
        map: { generator: 'gen.village', width: 1200, height: 600 },
      };
      const a = makeWorld(opts);
      expect(a.hash()).toBe(makeWorld(opts).hash());
      expect(a.groups.count).toBeGreaterThanOrEqual(6);
      const g = a.grid;
      for (const t of a.tanks) {
        for (let x = t.x - TANK_HALF - 4; x < t.x + TANK_HALF + 4; x++) {
          for (let y = 0; y < g.height; y++) expect(g.group[y * g.width + x]).toBe(0);
        }
      }
      expect(a.quiet).toBe(true);
    }
  });
});

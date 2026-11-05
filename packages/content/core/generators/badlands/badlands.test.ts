import { describe, expect, it } from 'vitest';
import { TANK_H, TANK_HALF } from '@mudders/sim';
import { makeWorld } from '../../../src/testing';

describe('gen.badlands', () => {
  it('places arches, ledges and boulders, some sheltering tanks, deterministically', () => {
    let sheltered = 0;
    for (const seed of [1, 2, 3, 4]) {
      const opts = {
        seed,
        players: 4,
        map: { generator: 'gen.badlands', width: 1200, height: 600 },
      };
      const a = makeWorld(opts);
      expect(a.hash()).toBe(makeWorld(opts).hash());
      expect(a.groups.count).toBeGreaterThanOrEqual(5);
      const g = a.grid;
      for (const t of a.tanks) {
        // never inside rock: the tank's body is clear and it stands on the ground
        for (let x = t.x - TANK_HALF; x < t.x + TANK_HALF; x++) {
          for (let y = t.y - TANK_H; y < t.y; y++) expect(g.material[y * g.width + x]).toBe(0);
        }
        let roof = false;
        for (let y = 0; y < t.y - TANK_H && !roof; y++) roof = g.group[y * g.width + t.x] !== 0;
        if (roof) sheltered++;
      }
      expect(a.quiet).toBe(true);
    }
    expect(sheltered).toBeGreaterThanOrEqual(4);
  });
});

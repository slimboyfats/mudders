import { describe, expect, it } from 'vitest';
import { countCells, makeWorld } from '../../../src/testing';

describe('gen.marsh', () => {
  it('fills the valleys with mud, deterministically, and keeps tanks out of it', () => {
    for (const seed of [1, 2, 3]) {
      const opts = { seed, players: 4, map: { generator: 'gen.marsh', width: 1200, height: 600 } };
      const a = makeWorld(opts);
      expect(a.hash()).toBe(makeWorld(opts).hash());
      expect(countCells(a, 'material.mud')).toBeGreaterThan(2000);
      expect(a.quiet).toBe(true);
    }
  });

  it('gen.hills itself has no mud', () => {
    const w = makeWorld({ seed: 1, map: { generator: 'gen.hills', width: 1200, height: 600 } });
    expect(countCells(w, 'material.mud')).toBe(0);
  });
});

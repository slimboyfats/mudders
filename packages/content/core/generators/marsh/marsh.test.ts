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

  it('seeps tar into the deepest dips and grows moss on the banks', () => {
    let tar = 0;
    let moss = 0;
    for (const seed of [1, 2, 3, 4]) {
      const opts = { seed, players: 4, map: { generator: 'gen.marsh', width: 1200, height: 600 } };
      const w = makeWorld(opts);
      expect(w.quiet).toBe(true);
      tar += countCells(w, 'material.tar');
      moss += countCells(w, 'material.moss');
    }
    expect(tar).toBeGreaterThan(2000);
    expect(moss).toBeGreaterThan(2000);
  });

  it('gen.hills itself has no mud, tar or moss', () => {
    const w = makeWorld({ seed: 1, map: { generator: 'gen.hills', width: 1200, height: 600 } });
    expect(countCells(w, 'material.mud')).toBe(0);
    expect(countCells(w, 'material.tar')).toBe(0);
    expect(countCells(w, 'material.moss')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.earth-bridge', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('terrainop.earth-bridge')).toBe(true);
  });

  it('spans a valley between the impact and the shooter, held up by piers', () => {
    const w = flatWorld();
    const g = w.grid;
    const W = g.width;
    // a 40-deep, 100-wide valley between x = 90 and x = 190
    for (let y = 150; y < 190; y++) {
      for (let x = 90; x < 190; x++) g.material[y * W + x] = 0;
    }
    g.clearSettle();
    dropAt(w, 'weapon.earth-bridge', 220);
    const cell = w.mats.cellOf('material.rammed-earth');
    // deck over the middle of the valley at ground level
    let deck = 0;
    for (let y = 148; y < 158; y++) if (g.get(140, y) === cell) deck++;
    expect(deck).toBeGreaterThanOrEqual(4);
    // it reaches the shooter's side, but never into their tank
    const t = w.tanks[0]!;
    expect(g.get(t.x + t.half + 4, 150)).not.toBe(0);
    for (let y = t.y - t.h; y < t.y; y++) expect(g.get(t.x, y)).toBe(0);
    expect(countCells(w, 'material.rammed-earth')).toBeGreaterThan(500);
  });
});

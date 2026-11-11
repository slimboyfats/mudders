import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.crystal-bloom', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('terrainop.crystal-bloom')).toBe(true);
  });

  it('grows crystal spires up into the air and skewers a tank in the way', () => {
    const w = flatWorld(150, { map: { width: 400, height: 260 }, tankColumns: [40, 215] });
    const before = countCells(w, 'material.crystal');
    dropAt(w, 'weapon.crystal-bloom', 200, 3000);
    expect(w.phase).toBe('aim');
    const g = w.grid;
    const crystal = w.mats.cellOf('material.crystal');
    // spires stand well above the old ground
    let tallest = 999;
    for (let y = 0; y < 150; y++)
      for (let x = 100; x < 300; x++)
        if (g.material[y * g.width + x] === crystal && y < tallest) tallest = y;
    expect(countCells(w, 'material.crystal') - before).toBeGreaterThan(800);
    expect(tallest).toBeLessThan(150 - 60);
    // the tank next to it got skewered and lifted
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(w.tanks[1]!.y).toBeLessThan(150);
    // the far tank is untouched
    expect(w.tanks[0]!.health).toBe(100);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.rift', () => {
  it('opens deep cracks with magma pooled at the bottom of the inner ones', () => {
    const w = flatWorld(150, { tankColumns: [20, 780], map: { width: 800, height: 300 } });
    dropAt(w, 'weapon.fault-line', 400);
    const g = w.grid;
    let deep = 0;
    for (let x = 250; x < 550; x++) deep = Math.max(deep, g.surfaceY(x));
    expect(deep).toBeGreaterThan(172);
    expect(countCells(w, 'material.lava') + countCells(w, 'material.rock')).toBeGreaterThan(0);
  });

  it('leaves the map beyond its reach alone', () => {
    const w = flatWorld(150, { tankColumns: [20, 780], map: { width: 800, height: 300 } });
    dropAt(w, 'weapon.fault-line', 400);
    for (let x = 0; x < 120; x++) expect(w.grid.surfaceY(x)).toBe(150);
  });

  it('does not split rock', () => {
    const w = flatWorld(150, { tankColumns: [20, 780], map: { width: 800, height: 300 } });
    const g = w.grid;
    const rock = w.mats.cellOf('material.rock');
    for (let x = 300; x < 500; x++)
      for (let y = 150; y < g.height; y++) g.material[y * g.width + x] = rock;
    dropAt(w, 'weapon.fault-line', 400);
    for (let x = 300; x < 500; x++)
      for (let y = 150; y < g.height; y++)
        if (Math.abs(x - 400) > 16) expect(g.material[y * g.width + x]).toBe(rock);
  });
});

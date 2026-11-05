import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.tectonic', () => {
  it('carries ground outward: a trough at the centre, a rim at the end, nothing lost', () => {
    const w = flatWorld(150, { tankColumns: [20, 380], map: { width: 800, height: 200 } });
    const b = countCells(w);
    dropAt(w, 'weapon.tectonic-charge', 400);
    expect(w.grid.surfaceY(400)).toBeGreaterThan(150);
    let rim = 150;
    for (let x = 700; x < 790; x++) rim = Math.min(rim, w.grid.surfaceY(x));
    expect(rim).toBeLessThan(150);
    expect(Math.abs(countCells(w) - b)).toBeLessThan(120);
  });

  it('stops at rock', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const g = w.grid;
    const rock = w.mats.cellOf('material.rock');
    for (let x = 250; x < 400; x++)
      for (let y = 150; y < g.height; y++) g.material[y * g.width + x] = rock;
    dropAt(w, 'weapon.tectonic-charge', 200);
    expect(g.surfaceY(300)).toBe(150);
  });
});

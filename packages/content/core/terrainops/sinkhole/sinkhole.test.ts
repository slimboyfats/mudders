import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('terrainop.sinkhole', () => {
  it('swallows ground into the cavern instead of piling it up', () => {
    const w = flatWorld(150, { tankColumns: [20, 780], map: { width: 800, height: 300 } });
    const before = countCells(w);
    dropAt(w, 'weapon.sinkhole', 400);
    expect(countCells(w)).toBeLessThan(before - 3000);
    let high = w.grid.height;
    for (let x = 300; x < 500; x++) high = Math.min(high, w.grid.surfaceY(x));
    expect(high).toBeGreaterThanOrEqual(148);
  });

  it('sags with a warning before the ground gives way', () => {
    const w = flatWorld(150, { tankColumns: [20, 780], map: { width: 800, height: 300 } });
    dropAt(w, 'weapon.sinkhole', 400, 30);
    expect(w.grid.surfaceY(400)).toBeLessThan(160);
    expect(effectsOf(w, 'sinkholeDust').length).toBeGreaterThan(0);
  });

  it('does not sink rock', () => {
    const w = flatWorld(150, { tankColumns: [20, 780], map: { width: 800, height: 300 } });
    const g = w.grid;
    const rock = w.mats.cellOf('material.rock');
    for (let x = 300; x < 500; x++)
      for (let y = 150; y < g.height; y++) g.material[y * g.width + x] = rock;
    dropAt(w, 'weapon.sinkhole', 400);
    for (let x = 300; x < 500; x++)
      for (let y = 150; y < g.height; y++)
        if (Math.abs(x - 400) > 10) expect(g.material[y * g.width + x]).toBe(rock);
  });
});

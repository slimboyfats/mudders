import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.quake', () => {
  it('throws loose ground up across the map but leaves rock alone', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const g = w.grid;
    const rock = w.mats.cellOf('material.rock');
    for (let x = 300; x < 400; x++)
      for (let y = 150; y < g.height; y++) g.material[y * g.width + x] = rock;
    const r = countCells(w, 'material.rock');
    let thrown = 0;
    const idx = w.weaponByIndex('weapon.earthquake');
    expect(idx).toBeGreaterThanOrEqual(0);
    dropAt(w, 'weapon.earthquake', 100);
    for (let x = 0; x < 300; x++) if (g.surfaceY(x) !== 150) thrown++;
    expect(thrown).toBeGreaterThan(30);
    expect(countCells(w, 'material.rock')).toBe(r);
  });
});

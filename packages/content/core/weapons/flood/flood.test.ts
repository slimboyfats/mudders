import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.flood', () => {
  it('washes a sand dune down, then soaks away so the turn can end', () => {
    const w = flatWorld();
    const sand = w.mats.cellOf('material.sand');
    for (let x = 230; x < 290; x++)
      for (let y = 150 - (30 - Math.abs(x - 260)); y < 150; y++) w.grid.set(x, y, sand);
    w.grid.markDirty(230, 100, 290, 150);
    w.run(100);
    const s0 = countCells(w, 'material.sand');
    const n = dropAt(w, 'weapon.flood', 225, 3000);
    expect(n).toBeLessThan(3000);
    expect(countCells(w, 'material.sand')).toBeLessThan(s0 - 20);
    expect(countCells(w, 'material.water')).toBe(0);
  });
});

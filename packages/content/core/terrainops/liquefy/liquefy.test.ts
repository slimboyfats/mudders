import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.liquefy', () => {
  it('turns a hill into liquid dirt that flattens and sets', () => {
    const w = flatWorld();
    const dirt = w.mats.cellOf('material.dirt');
    for (let y = 100; y < 150; y++) for (let x = 170; x < 230; x++) w.grid.set(x, y, dirt);
    w.grid.markDirty(170, 100, 230, 150);
    w.run(5);
    dropAt(w, 'weapon.quicksand', 200);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(110);
    expect(countCells(w, 'material.liquid-dirt')).toBe(0);
  });
});

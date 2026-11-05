import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.wood', () => {
  it('stands on its own and burns from a neighbouring flame', () => {
    const w = flatWorld();
    const wood = w.mats.cellOf('material.wood');
    for (let y = 120; y < 150; y++) for (let x = 198; x < 202; x++) w.grid.set(x, y, wood);
    for (let y = 136; y < 142; y++) w.grid.set(197, y, w.mats.cellOf('material.fire'));
    w.grid.markDirty(196, 118, 203, 150);
    w.run(600);
    expect(countCells(w, 'material.wood')).toBeLessThan(60);
    expect(countCells(w, 'material.ash')).toBeGreaterThan(30);
  });
});

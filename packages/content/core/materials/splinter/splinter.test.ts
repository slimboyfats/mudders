import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.splinter', () => {
  it('slides into a pile that burns', () => {
    const w = flatWorld();
    const s = w.mats.cellOf('material.splinter');
    for (let y = 120; y < 150; y++) for (let x = 196; x < 204; x++) w.grid.set(x, y, s);
    w.grid.markDirty(196, 120, 204, 150);
    w.run(300);
    const pile = countCells(w, 'material.splinter');
    const top = w.grid.surfaceY(200);
    w.grid.set(200, top - 1, w.mats.cellOf('material.fire'));
    w.grid.markDirty(199, top - 2, 201, top);
    w.run(800);
    expect(countCells(w, 'material.splinter')).toBeLessThan(pile / 2);
  });
});

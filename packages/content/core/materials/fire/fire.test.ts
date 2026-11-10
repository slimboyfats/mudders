import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.fire', () => {
  it('burns out into ash, and water puts it out at once', () => {
    const w = flatWorld();
    const f = w.mats.cellOf('material.fire');
    for (let x = 190; x < 200; x++) w.grid.set(x, 149, f);
    w.grid.set(205, 149, f);
    w.grid.set(205, 148, w.mats.cellOf('material.water'));
    w.grid.markDirty(189, 147, 207, 150);
    w.step();
    w.step();
    expect(w.grid.get(205, 149)).not.toBe(f);
    w.run(200);
    expect(countCells(w, 'material.fire')).toBe(0);
    expect(countCells(w, 'material.ash')).toBeGreaterThan(5);
  });
});

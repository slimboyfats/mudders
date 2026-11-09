import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.plasma', () => {
  it('eats down into the dirt, then cools to glass', () => {
    const w = flatWorld();
    const p = w.mats.cellOf('material.plasma');
    for (let y = 140; y < 150; y++) for (let x = 190; x < 210; x++) w.grid.set(x, y, p);
    w.grid.markDirty(190, 140, 210, 150);
    const dirt = countCells(w, 'material.dirt');
    const glass = countCells(w, 'material.glass');
    w.run(400);
    expect(countCells(w, 'material.plasma')).toBe(0);
    expect(countCells(w, 'material.dirt')).toBeLessThan(dirt);
    expect(countCells(w, 'material.glass')).toBeGreaterThan(glass);
    expect(w.quiet).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.napalm', () => {
  it('burns the dirt it touches to ash, then burns out', () => {
    const w = flatWorld();
    const n = w.mats.cellOf('material.napalm');
    for (let y = 140; y < 150; y++) for (let x = 190; x < 210; x++) w.grid.set(x, y, n);
    w.grid.markDirty(190, 140, 210, 150);
    w.run(400);
    expect(countCells(w, 'material.napalm')).toBe(0);
    expect(countCells(w, 'material.ash')).toBeGreaterThan(0);
    expect(w.quiet).toBe(true);
  });
});

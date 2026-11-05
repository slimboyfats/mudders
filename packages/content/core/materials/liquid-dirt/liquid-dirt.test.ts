import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.liquid-dirt', () => {
  it('flows flat and sets back into dirt', () => {
    const w = flatWorld();
    const ld = w.mats.cellOf('material.liquid-dirt');
    for (let y = 110; y < 150; y++) for (let x = 190; x < 210; x++) w.grid.set(x, y, ld);
    w.grid.markDirty(190, 110, 210, 150);
    w.run(60);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(125);
    w.run(400);
    expect(countCells(w, 'material.liquid-dirt')).toBe(0);
    expect(w.quiet).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.lit-keg-powder', () => {
  it('burns out in a moment and lights the keg powder beside it', () => {
    const w = flatWorld();
    const g = w.grid;
    const kegs = w.mats.cellOf('material.keg-powder');
    for (let y = 144; y < 150; y++)
      for (let x = 190; x < 210; x++) g.material[y * g.width + x] = kegs;
    g.material[143 * g.width + 200] = w.mats.cellOf('material.lit-keg-powder');
    g.markDirty(190, 143, 209, 149);
    w.run(400);
    expect(countCells(w, 'material.lit-keg-powder')).toBe(0);
    expect(countCells(w, 'material.keg-powder')).toBeLessThan(40);
  });
});

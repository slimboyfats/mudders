import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.burning-oil', () => {
  it('runs along a strip of oil, down a slope too, and burns away', () => {
    const w = flatWorld();
    const g = w.grid;
    const oil = w.mats.cellOf('material.oil');
    const burning = w.mats.cellOf('material.burning-oil');
    // a 1:1 rock slope going down to the right, oiled along its surface
    const dirt = w.mats.cellOf('material.rock');
    for (let x = 150; x < 200; x++) for (let y = 100 + (x - 150); y < 150; y++) g.set(x, y, dirt);
    for (let x = 150; x < 200; x++) g.coating[(100 + (x - 150)) * g.width + x] = oil;
    g.coating[100 * g.width + 150] = burning;
    g.markDirty(149, 99, 201, 150);
    w.run(600);
    let left = 0;
    for (let i = 0; i < g.coating.length; i++)
      if (g.coating[i] === oil || g.coating[i] === burning) left++;
    expect(left).toBeLessThan(5);
    expect(w.quiet).toBe(true);
  });
});

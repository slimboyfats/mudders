import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.scorch', () => {
  it('falls like dirt when its support is gone', () => {
    const w = flatWorld();
    const scorch = w.mats.cellOf('material.scorch');
    for (let x = 190; x < 200; x++) w.grid.set(x, 120, scorch);
    w.grid.markDirty(190, 120, 200, 120);
    w.run(120);
    expect(w.grid.get(195, 120)).toBe(0);
    expect(w.grid.get(195, 149)).toBe(scorch);
  });
});

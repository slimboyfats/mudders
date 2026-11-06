import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.cracked-concrete', () => {
  it('is weaker than sound concrete but still static', () => {
    const w = flatWorld();
    const cracked = w.mats.cellOf('material.cracked-concrete');
    const concrete = w.mats.cellOf('material.concrete');
    expect(w.mats.strengthOf(cracked, 0)).toBeLessThan(w.mats.strengthOf(concrete, 0));
    w.grid.set(200, 100, cracked);
    w.grid.markDirty(199, 99, 201, 101);
    w.run(60);
    expect(w.grid.get(200, 100)).toBe(cracked);
  });
});

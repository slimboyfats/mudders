import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.cracked-concrete', () => {
  it('is weaker than sound concrete but still static', () => {
    const w = flatWorld();
    const cracked = w.mats.cellOf('material.cracked-concrete');
    const concrete = w.mats.cellOf('material.concrete');
    expect(w.mats.strengthOf(cracked, 0)).toBeLessThan(w.mats.strengthOf(concrete, 0));
    // on the ground it stays; hanging in the air it comes down like anything else (§4b)
    w.grid.set(200, 149, cracked);
    w.grid.set(220, 100, cracked);
    w.grid.markDirty(199, 99, 221, 150);
    w.run(120);
    expect(w.grid.get(200, 149)).toBe(cracked);
    expect(w.grid.get(220, 100)).toBe(0);
    expect(w.grid.get(220, 149)).toBe(cracked);
  });
});

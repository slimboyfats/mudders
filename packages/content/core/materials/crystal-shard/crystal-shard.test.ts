import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('material.crystal-shard', () => {
  it('slides into a heap and still mirrors a laser', () => {
    const w = flatWorld();
    const s = w.mats.cellOf('material.crystal-shard');
    // a tall loose column of shards slumps into a heap
    for (let y = 60; y < 150; y++) for (let x = 200; x < 204; x++) w.grid.set(x, y, s);
    w.grid.markDirty(200, 60, 203, 149);
    w.run(600);
    expect(w.grid.get(201, 70)).toBe(0);
    expect(w.grid.surfaceY(201)).toBeGreaterThan(110);
    w.snapshot();
    launchAt(w, 'weapon.laser', 120, 146, 4, 0, 400);
    expect(effectsOf(w, 'reflect').length).toBeGreaterThan(0);
  });
});

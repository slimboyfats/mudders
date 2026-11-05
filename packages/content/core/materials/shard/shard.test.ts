import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.shard', () => {
  it('slides into a low pile', () => {
    const w = flatWorld();
    const s = w.mats.cellOf('material.shard');
    for (let y = 110; y < 150; y++) for (let x = 199; x < 201; x++) w.grid.set(x, y, s);
    w.grid.markDirty(199, 110, 201, 150);
    w.run(300);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(135);
  });
});

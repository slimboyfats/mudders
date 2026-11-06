import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.ice-shards', () => {
  it('slides off a ledge into a heap and stays slippery', () => {
    const w = flatWorld();
    const s = w.mats.cellOf('material.ice-shards');
    for (let y = 120; y < 150; y++) w.grid.set(200, y, s);
    w.grid.markDirty(199, 119, 201, 150);
    w.run(400);
    // the column has spread out sideways rather than standing as a pillar
    expect(w.grid.get(200, 120)).toBe(0);
    let spread = 0;
    for (let x = 180; x < 220; x++) if (w.grid.get(x, 149) === s) spread++;
    expect(spread).toBeGreaterThan(5);
    expect(w.mats.slickTicks[s]).toBeGreaterThan(0);
  });
});

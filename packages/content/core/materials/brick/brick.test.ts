import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.brick', () => {
  it('is harder than dirt to blast and ignores fire', () => {
    const w = flatWorld();
    const brick = w.mats.cellOf('material.brick');
    const dirt = w.mats.cellOf('material.dirt');
    expect(w.mats.strengthOf(brick, 0)).toBeGreaterThan(w.mats.strengthOf(dirt, 0));
    for (let x = 190; x < 210; x++) w.grid.set(x, 149, brick);
    w.grid.set(200, 148, w.mats.cellOf('material.fire'));
    w.grid.markDirty(189, 147, 211, 150);
    w.run(200);
    let left = 0;
    for (let x = 190; x < 210; x++) if (w.grid.get(x, 149) === brick) left++;
    expect(left).toBe(20);
  });
});

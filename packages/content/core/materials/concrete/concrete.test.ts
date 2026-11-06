import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.concrete', () => {
  it('is harder to blast than brick and ignores fire', () => {
    const w = flatWorld();
    const concrete = w.mats.cellOf('material.concrete');
    const brick = w.mats.cellOf('material.brick');
    expect(w.mats.strengthOf(concrete, 0)).toBeGreaterThan(w.mats.strengthOf(brick, 0));
    for (let x = 190; x < 210; x++) w.grid.set(x, 149, concrete);
    w.grid.set(200, 148, w.mats.cellOf('material.fire'));
    w.grid.markDirty(189, 147, 211, 150);
    w.run(200);
    let left = 0;
    for (let x = 190; x < 210; x++) if (w.grid.get(x, 149) === concrete) left++;
    expect(left).toBe(20);
  });
});

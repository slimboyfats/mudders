import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.leaf', () => {
  it('drifts down like sand when nothing holds it up', () => {
    const w = flatWorld();
    const l = w.mats.cellOf('material.leaf');
    for (let y = 100; y < 110; y++) for (let x = 195; x < 205; x++) w.grid.set(x, y, l);
    w.grid.markDirty(195, 100, 205, 110);
    w.run(300);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(140);
  });
});

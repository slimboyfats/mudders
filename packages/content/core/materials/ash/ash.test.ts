import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.ash', () => {
  it('slides like sand and is weaker than dirt', () => {
    const w = flatWorld();
    const ash = w.mats.cellOf('material.ash');
    for (let y = 100; y < 150; y++) for (let x = 198; x < 202; x++) w.grid.set(x, y, ash);
    w.grid.markDirty(198, 100, 202, 150);
    w.run(300);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(130);
    expect(w.mats.strengthOf(ash, 0)).toBeLessThan(256);
  });
});

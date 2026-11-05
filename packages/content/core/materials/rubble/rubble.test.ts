import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.rubble', () => {
  it('pours into a heap and stays there', () => {
    const w = flatWorld();
    const r = w.mats.cellOf('material.rubble');
    for (let y = 100; y < 150; y++) for (let x = 196; x < 204; x++) w.grid.set(x, y, r);
    w.grid.markDirty(196, 100, 204, 150);
    w.run(400);
    expect(w.quiet).toBe(true);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(115);
    expect(w.grid.surfaceY(200)).toBeLessThan(150);
  });
});

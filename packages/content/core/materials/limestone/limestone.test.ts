import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.limestone', () => {
  it('hangs from a cave roof without falling and is softer than rock', () => {
    const w = flatWorld();
    const lime = w.mats.cellOf('material.limestone');
    const rock = w.mats.cellOf('material.rock');
    const dirt = w.mats.cellOf('material.dirt');
    expect(w.mats.strengthOf(lime, 0)).toBeLessThan(w.mats.strengthOf(rock, 0));
    expect(w.mats.strengthOf(lime, 0)).toBeGreaterThan(w.mats.strengthOf(dirt, 0));
    for (let y = 40; y < 70; y++) w.grid.set(200, y, lime);
    w.grid.markDirty(199, 39, 201, 71);
    w.run(120);
    for (let y = 40; y < 70; y++) expect(w.grid.get(200, y)).toBe(lime);
  });
});

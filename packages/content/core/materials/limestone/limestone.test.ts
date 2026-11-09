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
    // a rock cave roof (10 rows) on a rock wall that stands on the floor, a stalactite under it
    for (let x = 190; x < 194; x++) for (let y = 30; y < 150; y++) w.grid.set(x, y, rock);
    for (let x = 190; x < 215; x++) for (let y = 30; y < 40; y++) w.grid.set(x, y, rock);
    for (let y = 40; y < 60; y++) w.grid.set(200, y, lime);
    w.grid.markDirty(189, 29, 216, 150);
    w.run(200);
    for (let y = 40; y < 60; y++) expect(w.grid.get(200, y)).toBe(lime);
    expect(w.grid.get(214, 35)).toBe(rock);
  });
});

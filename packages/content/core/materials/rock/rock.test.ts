import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('material.rock', () => {
  it('never moves and resists blasts at half radius', () => {
    const w = makeWorld({ map: { width: 200, height: 100 } });
    const rock = w.mats.cellOf('material.rock');
    w.grid.material.fill(0);
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) w.grid.set(x, y, rock);
    w.grid.markDirty(10, 10, 19, 19);
    w.run(30);
    expect(w.grid.get(15, 10)).toBe(rock);
    expect(w.mats.strengthOf(rock, 0)).toBe(512);
  });
});

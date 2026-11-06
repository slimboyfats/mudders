import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.floatstone', () => {
  it('hangs in the air and holds up dirt, but is softer than rock', () => {
    const w = flatWorld();
    const stone = w.mats.cellOf('material.floatstone');
    const dirt = w.mats.cellOf('material.dirt');
    const rock = w.mats.cellOf('material.rock');
    expect(w.mats.strengthOf(stone, 0)).toBeLessThan(w.mats.strengthOf(rock, 0));
    expect(w.mats.strengthOf(stone, 0)).toBeGreaterThan(w.mats.strengthOf(dirt, 0));
    for (let x = 190; x < 210; x++) {
      w.grid.set(x, 80, stone);
      w.grid.set(x, 79, dirt);
    }
    w.grid.markDirty(189, 78, 211, 81);
    w.run(120);
    for (let x = 190; x < 210; x++) {
      expect(w.grid.get(x, 80)).toBe(stone);
      expect(w.grid.get(x, 79)).toBe(dirt);
    }
  });
});

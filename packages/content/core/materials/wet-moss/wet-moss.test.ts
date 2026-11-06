import { describe, expect, it } from 'vitest';
import { countCells, passTurns } from '../../../src/testing';
import { mossWorld, pour } from '../moss/moss.test';

describe('material.wet-moss', () => {
  it('does not burn: fire on soaked moss goes out', () => {
    const w = mossWorld();
    pour(w);
    const wet = countCells(w, 'material.wet-moss');
    const fire = w.mats.cellOf('material.fire');
    for (let x = 150; x < 250; x++) {
      const y = w.grid.surfaceY(x) - 1;
      if (y >= 0) w.grid.set(x, y, fire);
      w.grid.markDirty(x, Math.max(0, y), x, Math.max(0, y));
    }
    for (let i = 0; i < 300; i++) w.step();
    expect(countCells(w, 'material.wet-moss')).toBe(wet);
  });

  it('dries back to sponge moss after three turns', () => {
    const w = mossWorld();
    pour(w);
    expect(countCells(w, 'material.wet-moss')).toBeGreaterThan(0);
    passTurns(w, 3);
    expect(countCells(w, 'material.wet-moss')).toBe(0);
    expect(countCells(w, 'material.moss')).toBeGreaterThan(600);
  });
});

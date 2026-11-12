import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, flatten, makeWorld } from '../../../src/testing';

describe('material.dirt', () => {
  it('is the baseline: falls, resistance 1 (except acid, which it shrugs off)', () => {
    const m = loadContent().get('material', 'material.dirt');
    expect(m.settle).toBe('fall');
    expect(m.strength).toEqual({ corrosive: 12 });
  });

  it('a floating block falls back onto the ground', () => {
    const w = makeWorld({ map: { width: 200, height: 100 } });
    flatten(w, 80);
    const dirt = w.mats.cellOf('material.dirt');
    for (let y = 10; y < 20; y++) for (let x = 50; x < 60; x++) w.grid.set(x, y, dirt);
    w.grid.markDirty(50, 10, 59, 19);
    const before = countCells(w, 'material.dirt');
    w.run(400);
    // it lands hard after a 50 cell drop and spreads: lower than the block it fell as, nothing lost
    expect(w.grid.surfaceY(55)).toBeGreaterThan(70);
    expect(w.grid.surfaceY(55)).toBeLessThan(80);
    expect(w.grid.surfaceY(45)).toBeLessThan(80);
    expect(countCells(w, 'material.dirt')).toBe(before);
    expect(w.grid.settling).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { flatten, makeWorld } from '../../../src/testing';

describe('material.dirt', () => {
  it('is the baseline: falls straight, resistance 1 (except acid, which it shrugs off)', () => {
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
    w.run(60);
    expect(w.grid.surfaceY(55)).toBe(70);
    expect(w.grid.settling).toBe(false);
  });
});

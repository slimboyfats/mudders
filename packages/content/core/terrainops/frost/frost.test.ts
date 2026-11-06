import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatten, makeWorld } from '../../../src/testing';

describe('terrainop.frost', () => {
  it('freezes the skin a few cells deep, freezes water into ice and spreads over several ticks', () => {
    const w = makeWorld({ map: { width: 600, height: 300 }, tankColumns: [60, 560] });
    flatten(w, 200);
    const g = w.grid;
    const water = w.mats.cellOf('material.water');
    // a pond in a pit beside the impact
    for (let y = 200; y < 210; y++)
      for (let x = 330; x < 350; x++) g.material[y * g.width + x] = water;
    const ticks = dropAt(w, 'weapon.frost-bomb', 300);
    expect(ticks).toBeGreaterThanOrEqual(30);
    expect(countCells(w, 'material.water')).toBe(0);
    expect(countCells(w, 'material.ice')).toBeGreaterThan(100);
    const frost = w.mats.cellOf('material.frost');
    const dirt = w.mats.cellOf('material.dirt');
    // 40 cells out from the impact: frosted at the surface, plain dirt a few cells down
    expect(g.material[200 * g.width + 260]).toBe(frost);
    expect(g.material[212 * g.width + 260]).toBe(dirt);
    // outside the radius nothing changes
    expect(g.material[200 * g.width + 420]).toBe(dirt);
  });
});

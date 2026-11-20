import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.fuel-vapour', () => {
  it('goes off in one blast as soon as air reaches it', () => {
    const w = flatWorld();
    const g = w.grid;
    const steel = w.mats.cellOf('material.steel');
    const vapour = w.mats.cellOf('material.fuel-vapour');
    for (let y = 140; y < 150; y++)
      for (let x = 190; x < 210; x++) {
        const edge = y === 140 || y === 149 || x === 190 || x === 209;
        g.material[y * g.width + x] = edge ? steel : vapour;
      }
    g.markDirty(190, 140, 209, 149);
    w.run(50);
    expect(countCells(w, 'material.fuel-vapour')).toBe(144);
    w.snapshot();
    g.clearCell(140 * g.width + 200);
    g.markDirty(200, 140, 200, 140);
    w.run(5);
    const ev = w.snapshot().effectEvents;
    expect(ev.filter((e) => e.type === 'pocketBurst')).toHaveLength(1);
    expect(countCells(w, 'material.fuel-vapour')).toBe(0);
  });
});

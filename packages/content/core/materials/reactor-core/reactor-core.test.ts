import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('material.reactor-core', () => {
  it('holds its shape and sits still until something sets it off', () => {
    const w = flatWorld(150);
    const core = w.mats.cellOf('material.reactor-core');
    for (let y = 150; y < 160; y++) for (let x = 100; x < 140; x++) w.grid.set(x, y, core);
    w.grid.markDirty(100, 150, 139, 159);
    w.run(120);
    expect(countCells(w, 'material.reactor-core')).toBe(400);
  });

  it('a blast sets the whole patch off in a chain', () => {
    const w = flatWorld(150);
    const core = w.mats.cellOf('material.reactor-core');
    for (let y = 152; y < 170; y++) for (let x = 120; x < 200; x++) w.grid.set(x, y, core);
    dropAt(w, 'weapon.baby-missile', 125);
    w.run(600);
    expect(countCells(w, 'material.reactor-core')).toBeLessThan(1440 / 4);
    expect(countCells(w, 'material.reactor-lit')).toBe(0);
  });
});

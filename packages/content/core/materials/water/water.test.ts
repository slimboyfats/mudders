import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.water', () => {
  it('levels out, quenches lava into rock and soaks away', () => {
    const w = flatWorld();
    const water = w.mats.cellOf('material.water');
    const lava = w.mats.cellOf('material.lava');
    for (let x = 240; x < 260; x++) for (let y = 146; y < 150; y++) w.grid.set(x, y, lava);
    for (let y = 100; y < 140; y++) for (let x = 230; x < 240; x++) w.grid.set(x, y, water);
    w.grid.markDirty(230, 100, 260, 150);
    w.run(60);
    expect(countCells(w, 'material.rock')).toBeGreaterThan(5);
    w.run(600);
    expect(countCells(w, 'material.water')).toBe(0);
    expect(w.quiet).toBe(true);
  });
});

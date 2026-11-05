import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('material.ice', () => {
  it('never falls and resists a missile far better than dirt', () => {
    const w = flatWorld(150, {});
    const ice = w.mats.cellOf('material.ice');
    for (let y = 150; y < 200; y++) for (let x = 150; x < 250; x++) w.grid.set(x, y, ice);
    for (let y = 100; y < 110; y++) w.grid.set(260, y, ice);
    w.grid.markDirty(150, 100, 260, 199);
    const before = countCells(w);
    dropAt(w, 'weapon.missile', 200);
    const iceHole = before - countCells(w);
    const d = flatWorld();
    const b2 = countCells(d);
    dropAt(d, 'weapon.missile', 200);
    expect(iceHole).toBeLessThan((b2 - countCells(d)) / 2);
    expect(w.grid.get(260, 100)).toBe(ice);
  });
});

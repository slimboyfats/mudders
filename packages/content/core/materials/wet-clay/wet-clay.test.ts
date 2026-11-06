import { describe, expect, it } from 'vitest';
import { countCells, flatWorld, passTurns } from '../../../src/testing';

describe('material.wet-clay', () => {
  it('is soft to blast and dries back into clay after three turns', () => {
    const w = flatWorld();
    const wet = w.mats.cellOf('material.wet-clay');
    for (let y = 150; y < 160; y++) for (let x = 180; x < 220; x++) w.grid.set(x, y, wet);
    w.grid.markDirty(179, 149, 221, 161);
    const dirt = w.mats.cellOf('material.dirt');
    expect(w.mats.strengthOf(wet, 0)).toBeLessThan(w.mats.strengthOf(dirt, 0));
    passTurns(w, 3);
    expect(countCells(w, 'material.wet-clay')).toBe(0);
    expect(countCells(w, 'material.clay')).toBeGreaterThan(300);
  });

  it('bogs a tank down a little', () => {
    const w = flatWorld();
    const wet = w.mats.cellOf('material.wet-clay');
    const t = w.tanks[0]!;
    for (let y = 150; y < 170; y++) for (let x = t.x - 20; x < t.x + 20; x++) w.grid.set(x, y, wet);
    w.grid.markDirty(t.x - 21, 149, t.x + 21, 171);
    const y0 = t.y;
    w.run(400);
    expect(t.y).toBeGreaterThan(y0);
    expect(t.y - y0).toBeLessThanOrEqual(3);
  });
});

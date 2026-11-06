import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

function clayWorld(): World {
  const w = flatWorld(150, {});
  const clay = w.mats.cellOf('material.clay');
  for (let y = 150; y < 200; y++) for (let x = 100; x < 300; x++) w.grid.set(x, y, clay);
  w.grid.markDirty(100, 150, 299, 199);
  return w;
}

describe('material.clay', () => {
  it('bakes into brick around a hot crater, but not around a plain blast', () => {
    const w = clayWorld();
    dropAt(w, 'weapon.hot-napalm', 200);
    expect(countCells(w, 'material.brick')).toBeGreaterThan(30);
    const b = clayWorld();
    dropAt(b, 'weapon.missile', 200);
    expect(countCells(b, 'material.brick')).toBe(0);
  });

  it('soaks up water and goes soft', () => {
    const w = clayWorld();
    const water = w.mats.cellOf('material.water');
    for (let y = 140; y < 150; y++) for (let x = 180; x < 220; x++) w.grid.set(x, y, water);
    w.grid.markDirty(179, 139, 221, 151);
    w.run(300);
    expect(countCells(w, 'material.wet-clay')).toBeGreaterThan(10);
    const clay = w.mats.cellOf('material.clay');
    const wet = w.mats.cellOf('material.wet-clay');
    expect(w.mats.strengthOf(wet, 0)).toBeLessThan(w.mats.strengthOf(clay, 0) / 2);
  });
});

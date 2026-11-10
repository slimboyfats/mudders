import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { countCells, flatWorld, passTurns } from '../../../src/testing';

/** A flat world whose top 6 rows from x 150 to 250 are sponge moss. */
export function mossWorld(): World {
  const w = flatWorld(150);
  const moss = w.mats.cellOf('material.moss');
  for (let y = 150; y < 156; y++) for (let x = 150; x < 250; x++) w.grid.set(x, y, moss);
  w.grid.clearSettle();
  w.grid.clearReact();
  return w;
}

/** Pour a block of water above the moss and run the reaction pass for `ticks` ticks. */
export function pour(w: World, ticks = 400): void {
  const water = w.mats.cellOf('material.water');
  for (let y = 130; y < 150; y++) for (let x = 170; x < 230; x++) w.grid.set(x, y, water);
  w.grid.markDirty(170, 130, 229, 149);
  for (let i = 0; i < ticks; i++) w.step();
}

describe('material.moss', () => {
  it('soaks up water and swells into the space it held', () => {
    const w = mossWorld();
    const before = countCells(w, 'material.moss');
    pour(w);
    const wet = countCells(w, 'material.wet-moss');
    const total = countCells(w, 'material.moss') + wet;
    // water stays now; only what ran off the moss edge is left
    expect(countCells(w, 'material.water')).toBeLessThan(120);
    expect(wet).toBeGreaterThan(400);
    // the moss mound grew by a good share of the 1200 water cells
    expect(total - before).toBeGreaterThan(400);
    // it swelled up above the old surface
    let above = 0;
    for (let x = 150; x < 250; x++) if (w.grid.surfaceY(x) < 150) above++;
    expect(above).toBeGreaterThan(30);
  });

  it('dry moss burns', () => {
    const w = mossWorld();
    const fire = w.mats.cellOf('material.fire');
    for (let x = 150; x < 250; x++) w.grid.set(x, 149, fire);
    w.grid.markDirty(150, 149, 249, 149);
    for (let i = 0; i < 300; i++) w.step();
    expect(countCells(w, 'material.moss')).toBeLessThan(600 - 50);
  });

  it('nothing else swells', () => {
    const w = flatWorld(150);
    pour(w);
    expect(countCells(w, 'material.wet-moss')).toBe(0);
    passTurns(w, 1);
  });
});

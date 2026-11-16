import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { countCells, dropAt, flatWorld, flatten, makeWorld } from '../../../src/testing';

/** Pour a block of acid into the air over (x0..x1, y0..y1) and mark it for settling. */
function pour(w: World, x0: number, x1: number, y0: number, y1: number): number {
  const g = w.grid;
  const acid = w.mats.cellOf('material.acid');
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * g.width + x;
      if (g.material[i] !== 0) continue;
      g.material[i] = acid;
      n++;
    }
  }
  g.markDirty(x0, y0, x1, y1);
  return n;
}

/** Step until the world is quiet (or `max` ticks); returns the ticks it took. */
function settle(w: World, max: number): number {
  let n = 0;
  while (n < max && !w.quiet) {
    w.step();
    n++;
  }
  return n;
}

describe('material.acid', () => {
  it('eats into dirt, fizzing, and is used up as it eats', () => {
    const w = flatWorld();
    const dirt = countCells(w, 'material.dirt');
    const poured = pour(w, 190, 210, 130, 149);
    const ticks = settle(w, 6000);
    const eaten = dirt - countCells(w, 'material.dirt');
    const left = countCells(w, 'material.acid');
    expect(eaten).toBeGreaterThan(poured / 2);
    // one cell of acid for each cell of dirt: never more eaten than poured
    expect(eaten + left).toBeLessThanOrEqual(poured);
    expect(left).toBeLessThan(poured / 2);
    // and the world goes quiet again
    expect(ticks).toBeLessThan(6000);
    expect(w.quiet).toBe(true);
  });

  it('gives off fumes that rise and fade', () => {
    const w = flatWorld();
    const fume = w.mats.cellOf('material.acid-fume');
    const fumes = () => w.grid.gas.reduce((n, g) => n + (g === fume ? 1 : 0), 0);
    pour(w, 190, 210, 130, 149);
    let most = 0;
    for (let t = 0; t < 300; t++) {
      w.step();
      most = Math.max(most, fumes());
    }
    expect(most).toBeGreaterThan(5);
    for (let t = 0; t < 3000; t++) w.step();
    expect(fumes()).toBe(0);
  });

  it('stops at rock, metal and glass', () => {
    for (const hard of ['material.rock', 'material.glass', 'material.concrete']) {
      const w = makeWorld({
        map: { width: 400, height: 200 },
        tankColumns: [40, 360],
        wind: 0,
        rules: { turnTimer: 0, suddenDeath: false },
      });
      flatten(w, 150, hard);
      const before = countCells(w, hard);
      const poured = pour(w, 190, 210, 130, 149);
      settle(w, 4000);
      expect(countCells(w, hard)).toBe(before);
      // nothing to eat: the acid is all still there, lying on top
      expect(countCells(w, 'material.acid')).toBe(poured);
      expect(w.quiet).toBe(true);
    }
  });

  it('eats the dirt but not the rock under it', () => {
    const w = flatWorld();
    const g = w.grid;
    const rock = w.mats.cellOf('material.rock');
    // a rock floor four cells under the surface
    g.material.fill(rock, 154 * g.width, 160 * g.width);
    const rocks = countCells(w, 'material.rock');
    pour(w, 190, 210, 120, 149);
    settle(w, 6000);
    expect(countCells(w, 'material.rock')).toBe(rocks);
    // the acid ate down to the rock floor and stopped there
    const dirt = w.mats.cellOf('material.dirt');
    let holes = 0;
    for (let y = 150; y < 154; y++) if (g.material[y * g.width + 200] !== dirt) holes++;
    expect(holes).toBe(4);
    expect(w.quiet).toBe(true);
  });

  it('hurts a tank sitting in it a little at the end of every turn', () => {
    const w = flatWorld();
    const t = w.tanks[0]!;
    // a pool around the first tank
    pour(w, t.x - 12, t.x + 12, 140, 149);
    // keep the dirt from eating it all before the turn ends: a rock bed
    const g = w.grid;
    g.material.fill(w.mats.cellOf('material.rock'), 150 * g.width, 151 * g.width);
    settle(w, 3000);
    expect(countCells(w, 'material.acid')).toBeGreaterThan(100);
    // a shot elsewhere: once it settles, the tank in the acid takes its sting
    const before = t.health;
    dropAt(w, 'weapon.riot-charge', 200);
    expect(t.health).toBe(before - 6);
  });
});

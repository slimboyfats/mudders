import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

/** A pool of fuel in a dug pit on the flat test map. */
function pool(w: World, x0: number, x1: number, depth: number): number {
  const g = w.grid;
  const fuel = w.mats.cellOf('material.fuel');
  let n = 0;
  for (let y = 150; y < 150 + depth; y++)
    for (let x = x0; x <= x1; x++) {
      g.material[y * g.width + x] = fuel;
      n++;
    }
  g.markDirty(x0, 150, x1, 150 + depth);
  return n;
}

describe('material.fuel', () => {
  it('lies still in a pit like oil', () => {
    const w = flatWorld();
    const n = pool(w, 180, 220, 6);
    w.run(300);
    expect(countCells(w, 'material.fuel')).toBe(n);
  });

  it('is lit by a blast that reaches it, and the fire runs through the pool', () => {
    const w = flatWorld();
    const n = pool(w, 150, 250, 6);
    dropAt(w, 'weapon.baby-missile', 155, 1);
    let burning = 0;
    for (let t = 0; t < 300; t++) {
      w.step();
      burning = Math.max(burning, countCells(w, 'material.burning-fuel'));
    }
    expect(burning).toBeGreaterThan(20);
    expect(countCells(w, 'material.fuel')).toBeLessThan(n / 4);
  });

  it('catches from plain fire, unlike nothing else around it', () => {
    const w = flatWorld();
    pool(w, 190, 210, 4);
    const g = w.grid;
    g.material[149 * g.width + 200] = w.mats.cellOf('material.fire');
    g.markDirty(200, 149, 200, 149);
    let burning = 0;
    for (let t = 0; t < 120; t++) {
      w.step();
      burning = Math.max(burning, countCells(w, 'material.burning-fuel'));
    }
    expect(burning).toBeGreaterThan(0);
  });
});

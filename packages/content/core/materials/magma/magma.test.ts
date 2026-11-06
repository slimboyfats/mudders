import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

/** A buried magma pocket: a 30×12 block whose top sits `depth` cells under the surface. */
function pocketWorld(depth: number) {
  const w = flatWorld(100);
  const magma = w.mats.cellOf('material.magma');
  for (let y = 100 + depth; y < 112 + depth; y++)
    for (let x = 185; x < 215; x++) w.grid.set(x, y, magma);
  w.grid.markDirty(185, 100, 215, 112 + depth);
  return w;
}

describe('material.magma', () => {
  it('stays molten and put while buried', () => {
    const w = pocketWorld(20);
    w.run(300);
    expect(countCells(w, 'material.magma')).toBe(360);
    expect(countCells(w, 'material.lava')).toBe(0);
    expect(w.quiet).toBe(true);
  });

  it('pours out as lava once a crater opens it, and the lava cools to rock', () => {
    const w = pocketWorld(8);
    const rockBefore = countCells(w, 'material.rock');
    dropAt(w, 'weapon.missile', 200, 4000);
    expect(countCells(w, 'material.magma')).toBeLessThan(200);
    expect(countCells(w, 'material.lava')).toBeGreaterThan(50);
    for (let i = 0; i < 3; i++) dropAt(w, 'weapon.riot-charge', 380);
    expect(countCells(w, 'material.lava')).toBe(0);
    expect(countCells(w, 'material.rock')).toBeGreaterThan(rockBefore + 50);
  });
});

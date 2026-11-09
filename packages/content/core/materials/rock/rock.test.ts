import { describe, expect, it } from 'vitest';
import { countCells, flatWorld, makeWorld } from '../../../src/testing';

describe('material.rock', () => {
  it('never moves and resists blasts at half radius', () => {
    const w = makeWorld({ map: { width: 200, height: 100 } });
    const rock = w.mats.cellOf('material.rock');
    w.grid.material.fill(0);
    for (let y = 90; y < 100; y++) for (let x = 10; x < 20; x++) w.grid.set(x, y, rock);
    w.grid.markDirty(10, 90, 19, 99);
    w.run(30);
    expect(w.grid.get(15, 90)).toBe(rock);
    expect(w.mats.strengthOf(rock, 0)).toBe(512);
  });

  /** A rock slab `thick` rows deep on flat dirt, with a pit dug out under columns a..b. */
  function shelf(thick: number, a: number, b: number): ReturnType<typeof flatWorld> {
    const w = flatWorld(170);
    const rock = w.mats.cellOf('material.rock');
    for (let x = 0; x < w.grid.width; x++)
      for (let y = 170; y < 170 + thick; y++) w.grid.set(x, y, rock);
    for (let x = a; x <= b; x++) for (let y = 170 + thick; y < 200; y++) w.grid.set(x, y, 0);
    w.grid.markDirty(0, 160, w.grid.width - 1, 199);
    w.run(600);
    return w;
  }
  function over(w: ReturnType<typeof flatWorld>, a: number, b: number, thick: number): number {
    const rock = w.mats.cellOf('material.rock');
    let n = 0;
    for (let x = a; x <= b; x++)
      for (let y = 170; y < 170 + thick; y++)
        if (w.grid.material[y * w.grid.width + x] === rock) n++;
    return n;
  }

  it('holds an overhang by its span and thickness, then breaks off and lands as rock', () => {
    // 4 rows reach 12: a 20-wide gap bridges; 40 wide, the middle drops out
    expect(over(shelf(4, 200, 219), 200, 219, 4)).toBe(80);
    const w = shelf(4, 200, 239);
    expect(over(w, 200, 239, 4)).toBeGreaterThan(70);
    expect(over(w, 200, 239, 4)).toBeLessThan(110);
    expect(over(w, 216, 223, 4)).toBe(0);
    expect(countCells(w, 'material.rock')).toBe(4 * w.grid.width); // fell as rock, not rubble
    expect(w.quiet).toBe(true);
    // 8 rows reach 24: the same 40-wide gap bridges
    expect(over(shelf(8, 200, 239), 200, 239, 8)).toBe(320);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

/** A flat valley floor at row 150 with a dirt hill `h` tall and 30 wide centred on each `xs`. */
function hills(xs: number[], h = 40, opts = {}) {
  const w = flatWorld(150, { tankColumns: [20, 380], ...opts });
  const dirt = w.mats.cellOf('material.dirt');
  for (const hx of xs)
    for (let x = hx - 15; x <= hx + 15; x++) {
      const top = 150 - Math.round((h * (15 - Math.abs(x - hx))) / 15);
      for (let y = top; y < 150; y++) w.grid.set(x, y, dirt);
    }
  w.grid.markDirty(0, 0, 399, 199);
  return w;
}

describe('weapon.daisy-cutter', () => {
  it('shaves the hills on both sides down to the height where it landed', () => {
    const w = hills([140, 260]);
    expect(w.grid.surfaceY(140)).toBe(110);
    dropAt(w, 'weapon.daisy-cutter', 200);
    // both hilltops are gone: the ground there is back near the valley floor
    expect(w.grid.surfaceY(140)).toBeGreaterThan(140);
    expect(w.grid.surfaceY(260)).toBeGreaterThan(140);
    // flat, not a round crater: no deep hole at the impact
    expect(w.grid.surfaceY(200)).toBeLessThan(170);
  });

  it('reaches far sideways but thins out at the rim', () => {
    const w = hills([200 - 125, 200 + 125]);
    dropAt(w, 'weapon.daisy-cutter', 200);
    // the far hills lose their tops but keep their feet
    expect(w.grid.surfaceY(75)).toBeGreaterThan(110 + 8);
    expect(w.grid.surfaceY(75)).toBeLessThan(150);
  });

  it('rock holds', () => {
    const w = hills([]);
    const rock = w.mats.cellOf('material.rock');
    for (let y = 120; y < 150; y++) for (let x = 250; x < 260; x++) w.grid.set(x, y, rock);
    dropAt(w, 'weapon.daisy-cutter', 200);
    // it may lose its footing, but not a cell of it is shaved off
    expect(countCells(w, 'material.rock')).toBe(300);
  });

  it('throws tanks away to the sides', () => {
    const w = hills([], 40, { tankColumns: [20, 250] });
    dropAt(w, 'weapon.daisy-cutter', 200);
    expect(w.tanks[1]!.x).toBeGreaterThan(270);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(w.tanks[0]!.health).toBe(100);
  });
});

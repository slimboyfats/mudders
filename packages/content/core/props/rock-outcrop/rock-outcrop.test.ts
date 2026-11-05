import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld, groupCells } from '../../../src/testing';
import type { World } from '@mudders/sim';

/** A flat world with a hill on the left that drops away to the right of x = 140. */
function slopeWorld(): World {
  const w = flatWorld(170);
  const g = w.grid;
  const dirt = w.mats.cellOf('material.dirt');
  for (let x = 0; x < 260; x++) {
    const top = x < 140 ? 110 : Math.min(170, 110 + (x - 140));
    for (let y = top; y < 170; y++) g.material[y * g.width + x] = dirt;
  }
  return w;
}

describe('prop.rock-outcrop', () => {
  it('juts out of a slope with its root buried and air under its far end', () => {
    const w = slopeWorld();
    // placeAt centres the prop; root at the left edge (column 140 - 36 = 104)
    w.groups.placeAt(w.grid, 'prop.rock-outcrop', 140);
    w.grid.clearSettle();
    const g = w.grid;
    const cells = groupCells(w);
    expect(cells).toBeGreaterThan(1200);
    // some of the root lies below the hill's surface
    let buried = 0;
    for (let x = 104; x < 120; x++)
      for (let y = 111; y < 125; y++) if (g.group[y * g.width + x]) buried++;
    expect(buried).toBeGreaterThan(100);
    // under the far end there is a gap between rock and ground
    let gap = 0;
    for (let y = 100; y < 170; y++) {
      const i = y * g.width + 165;
      if (g.material[i] === 0 && g.group[i - 5 * g.width] !== 0) gap++;
    }
    expect(gap).toBeGreaterThan(0);
    w.run(50);
    expect(groupCells(w)).toBe(cells);
  });

  it('breaks at the neck and the overhang comes down as rubble', () => {
    const w = slopeWorld();
    w.groups.placeAt(w.grid, 'prop.rock-outcrop', 140);
    w.grid.clearSettle();
    const cells = groupCells(w);
    dropAt(w, 'weapon.missile', 132);
    dropAt(w, 'weapon.missile', 132);
    w.run(600);
    const left = groupCells(w);
    expect(left).toBeLessThan(cells / 2);
    expect(left).toBeGreaterThan(100);
    expect(countCells(w, 'material.rubble')).toBeGreaterThan(300);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('material.snow', () => {
  it('is loose powder that a blast from above packs into ice', () => {
    const w = flatWorld(150);
    flattenSnow(w);
    const ice0 = countCells(w, 'material.ice');
    dropAt(w, 'weapon.missile', 200);
    expect(countCells(w, 'material.ice')).toBeGreaterThan(ice0);
  });

  it('melts next to lava', () => {
    const w = flatWorld(150);
    flattenSnow(w);
    const snow0 = countCells(w, 'material.snow');
    const lava = w.mats.cellOf('material.lava');
    for (let x = 190; x < 210; x++) w.grid.set(x, 135, lava);
    w.grid.markDirty(180, 120, 220, 160);
    for (let i = 0; i < 300; i++) w.step();
    // melt water quenches the lava in turn, so look for the snow that went
    expect(countCells(w, 'material.snow')).toBeLessThan(snow0 - 10);
  });
});

/** A 12-cell layer of snow on the flat ground. */
function flattenSnow(w: ReturnType<typeof flatWorld>): void {
  const snow = w.mats.cellOf('material.snow');
  for (let y = 138; y < 150; y++) for (let x = 0; x < w.grid.width; x++) w.grid.set(x, y, snow);
  for (const t of w.tanks) t.y = 138;
  w.grid.markDirty(0, 130, w.grid.width - 1, 151);
  for (let i = 0; i < 30; i++) w.step();
}

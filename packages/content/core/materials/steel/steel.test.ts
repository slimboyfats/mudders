import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

/** Cells of a 40×4 plate of `material` left after a missile lands on its middle. */
function plateAfterMissile(material: string): number {
  const w = flatWorld();
  const cell = w.mats.cellOf(material);
  for (let x = 180; x < 220; x++) for (let y = 150; y < 154; y++) w.grid.set(x, y, cell);
  w.grid.markDirty(180, 148, 220, 156);
  dropAt(w, 'weapon.missile', 200);
  return countCells(w, material);
}

describe('material.steel', () => {
  it('conducts, like water and unlike dirt', () => {
    const w = flatWorld();
    const conducts = w.mats.cellsTagged('conducts');
    expect(conducts).toContain(w.mats.cellOf('material.steel'));
    expect(conducts).toContain(w.mats.cellOf('material.water'));
    expect(conducts).not.toContain(w.mats.cellOf('material.dirt'));
  });

  it('holds together under a missile better than concrete', () => {
    const steel = plateAfterMissile('material.steel');
    const concrete = plateAfterMissile('material.concrete');
    expect(steel).toBeGreaterThan(concrete);
    expect(steel).toBeGreaterThan(60);
  });
});

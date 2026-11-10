import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld } from '../../../src/testing';

describe('prop.pine', () => {
  it('holds its canopy up until the trunk breaks', () => {
    const w = propWorld('prop.pine', 200);
    const leaves = countCells(w, 'material.needles');
    expect(leaves).toBeGreaterThan(60);
    w.grid.markDirty(170, 100, 230, 150);
    w.run(200);
    expect(countCells(w, 'material.needles')).toBe(leaves);
    dropAt(w, 'weapon.heavy-shockwave', 208);
    expect(groupCells(w)).toBe(0);
    expect(countCells(w, 'material.splinter')).toBeGreaterThan(5);
  });

  it('burns from an incendiary hit', () => {
    const w = propWorld('prop.pine', 200);
    const before = countCells(w, 'material.wood') + countCells(w, 'material.needles');
    dropAt(w, 'weapon.incendiary', 200);
    expect(countCells(w, 'material.wood') + countCells(w, 'material.needles')).toBeLessThan(
      before * 0.3,
    );
    expect(countCells(w, 'material.ash')).toBeGreaterThan(40);
    expect(w.quiet).toBe(true);
  });
});

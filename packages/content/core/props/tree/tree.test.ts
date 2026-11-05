import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld } from '../../../src/testing';

describe('prop.tree', () => {
  it('holds its sliding canopy up until the trunk breaks', () => {
    const w = propWorld('prop.tree', 200);
    const leaves = countCells(w, 'material.leaf');
    w.grid.markDirty(180, 100, 220, 150);
    w.run(200);
    expect(countCells(w, 'material.leaf')).toBe(leaves);
    expect(w.grid.surfaceY(200)).toBeLessThan(125);
    dropAt(w, 'weapon.heavy-shockwave', 225);
    expect(groupCells(w)).toBe(0);
    expect(countCells(w, 'material.splinter')).toBeGreaterThan(20);
  });

  it('burns from an incendiary hit', () => {
    const w = propWorld('prop.tree', 200);
    dropAt(w, 'weapon.incendiary', 200);
    expect(countCells(w, 'material.wood') + countCells(w, 'material.leaf')).toBeLessThan(40);
    expect(countCells(w, 'material.ash')).toBeGreaterThan(100);
    expect(w.quiet).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld } from '../../../src/testing';

describe('prop.maple', () => {
  it('holds its canopy up until the trunk breaks', () => {
    const w = propWorld('prop.maple', 200);
    const leaves = countCells(w, 'material.amber-leaf');
    expect(leaves).toBeGreaterThan(60);
    w.grid.markDirty(170, 100, 230, 150);
    w.run(200);
    expect(countCells(w, 'material.amber-leaf')).toBe(leaves);
    dropAt(w, 'weapon.heavy-shockwave', 225);
    expect(groupCells(w)).toBe(0);
    expect(countCells(w, 'material.splinter')).toBeGreaterThan(5);
  });

  it('burns from an incendiary hit', () => {
    const w = propWorld('prop.maple', 200);
    const before = countCells(w, 'material.wood') + countCells(w, 'material.amber-leaf');
    dropAt(w, 'weapon.incendiary', 200);
    expect(countCells(w, 'material.wood') + countCells(w, 'material.amber-leaf')).toBeLessThan(
      before * 0.3,
    );
    expect(countCells(w, 'material.ash')).toBeGreaterThan(40);
    expect(w.quiet).toBe(true);
  });
});

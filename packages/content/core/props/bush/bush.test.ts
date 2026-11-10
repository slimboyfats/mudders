import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld } from '../../../src/testing';

describe('prop.bush', () => {
  it('stands as a shrub until a blast breaks it, then the leaves pour down', () => {
    const w = propWorld('prop.bush', 200);
    const leaves = countCells(w, 'material.leaf');
    expect(leaves).toBeGreaterThan(50);
    w.grid.markDirty(185, 130, 215, 150);
    w.run(200);
    expect(countCells(w, 'material.leaf')).toBe(leaves);
    dropAt(w, 'weapon.heavy-shockwave', 215);
    expect(groupCells(w)).toBe(0);
  });

  it('burns from an incendiary hit', () => {
    const w = propWorld('prop.bush', 200);
    dropAt(w, 'weapon.incendiary', 200);
    expect(countCells(w, 'material.leaf')).toBeLessThan(20);
    expect(w.quiet).toBe(true);
  });
});

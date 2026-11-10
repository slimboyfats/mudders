import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld } from '../../../src/testing';

describe('prop.birch', () => {
  it('holds its canopy up until the trunk breaks', () => {
    const w = propWorld('prop.birch', 200);
    const leaves = countCells(w, 'material.leaf');
    expect(leaves).toBeGreaterThan(60);
    w.grid.markDirty(170, 100, 230, 150);
    w.run(200);
    expect(countCells(w, 'material.leaf')).toBe(leaves);
    dropAt(w, 'weapon.heavy-shockwave', 225);
    for (let n = 0; n < 1500 && !w.quiet; n++) w.step();
    expect(groupCells(w)).toBe(0);
    // blown to bits or felled: splinters, or a log lying beside the stump
    expect(
      countCells(w, 'material.splinter') + countCells(w, 'material.birch-log'),
    ).toBeGreaterThan(5);
  });

  it('burns from an incendiary hit', () => {
    const w = propWorld('prop.birch', 200);
    const before = countCells(w, 'material.birch-bark') + countCells(w, 'material.leaf');
    dropAt(w, 'weapon.incendiary', 200);
    expect(countCells(w, 'material.birch-bark') + countCells(w, 'material.leaf')).toBeLessThan(
      before * 0.3,
    );
    expect(countCells(w, 'material.ash')).toBeGreaterThan(40);
    expect(w.quiet).toBe(true);
  });
});

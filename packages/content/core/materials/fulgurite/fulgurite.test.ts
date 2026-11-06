import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('material.fulgurite', () => {
  it('a lightning strike lines its crater with fulgurite', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.lightning', 200);
    expect(countCells(w, 'material.fulgurite')).toBeGreaterThan(100);
  });

  it('holds up better than dirt against a missile', () => {
    const dug = (fill: string): number => {
      const w = flatWorld(150, { tankColumns: [20, 380] });
      w.grid.material.fill(w.mats.cellOf(fill), 150 * w.grid.width);
      const before = countCells(w);
      dropAt(w, 'weapon.missile', 200);
      return before - countCells(w);
    };
    expect(dug('material.fulgurite')).toBeLessThan(dug('material.dirt'));
  });
});

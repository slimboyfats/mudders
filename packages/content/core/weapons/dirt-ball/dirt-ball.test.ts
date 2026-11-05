import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.dirt-ball', () => {
  it('adds dirt that settles', () => {
    const w = flatWorld();
    const b = countCells(w);
    dropAt(w, 'weapon.dirt-ball', 200);
    expect(countCells(w) - b).toBeGreaterThan(500);
    expect(w.grid.surfaceY(200)).toBeLessThan(150);
  });
});

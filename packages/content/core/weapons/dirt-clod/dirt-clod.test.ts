import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.dirt-clod', () => {
  it('adds a small clump of dirt', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const b = countCells(w);
    dropAt(w, 'weapon.dirt-clod', 200);
    expect(countCells(w) - b).toBeGreaterThan(100);
    expect(countCells(w) - b).toBeLessThan(400);
  });
});

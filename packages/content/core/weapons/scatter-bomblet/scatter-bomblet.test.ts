import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.scatter-bomblet', () => {
  it('makes a small crater', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const b = countCells(w);
    dropAt(w, 'weapon.scatter-bomblet', 200);
    expect(b - countCells(w)).toBeGreaterThan(50);
    expect(b - countCells(w)).toBeLessThan(500);
  });
});

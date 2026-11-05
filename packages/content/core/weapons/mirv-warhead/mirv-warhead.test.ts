import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.mirv-warhead', () => {
  it('carves a crater', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const b = countCells(w);
    dropAt(w, 'weapon.mirv-warhead', 200);
    expect(countCells(w)).toBeLessThan(b - 200);
  });
});

import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.dirt-charge', () => {
  it('pushes a narrow column of dirt up where it lands', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.dirt-charge', 200);
    expect(w.grid.surfaceY(200)).toBeLessThan(115);
    expect(w.grid.surfaceY(215)).toBe(150);
  });
});

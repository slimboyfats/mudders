import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('material.cinder', () => {
  it('holds a cone shape but blasts still break it', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.volcano-seed', 200, 3000);
    const cone = countCells(w, 'material.cinder');
    expect(cone).toBeGreaterThan(500);
    // static: nothing slumped after the turn
    w.run(120);
    expect(countCells(w, 'material.cinder')).toBe(cone);
    dropAt(w, 'weapon.missile', 200, 3000);
    expect(countCells(w, 'material.cinder')).toBeLessThan(cone - 50);
  });
});

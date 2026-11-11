import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.hailstone', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.hailstone')).toBe(true);
  });

  it('cracks the ground', () => {
    const w = flatWorld(150, { map: { width: 600, height: 260 }, tankColumns: [60, 540] });
    dropAt(w, 'weapon.hailstone', 300);
    expect(w.grid.surfaceY(300)).toBeGreaterThan(150);
  });
});

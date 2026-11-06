import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('terrainop.heave', () => {
  it('bumps the surface over a shallow drill run and leaves deep ground alone', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const before = w.grid.surfaceY(150);
    // a torpedo landing at 120 runs right, under 150, toward the far tank
    launchAt(w, 'weapon.drill-torpedo', 100, 140, 1.5, 0.5);
    let moved = 0;
    for (let x = 130; x < 300; x++) if (w.grid.surfaceY(x) !== before) moved++;
    expect(moved).toBeGreaterThan(10);
    // nothing reaches the bottom of the map
    for (let x = 0; x < 400; x++) expect(w.grid.material[199 * 400 + x]).not.toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.mystery', () => {
  it('turns into a different weapon from seed to seed', () => {
    const outcome = (seed: number) => {
      const w = flatWorld(150, { seed, tankColumns: [20, 380] });
      const b = countCells(w);
      launchAt(w, 'weapon.mystery', 100, 120, 2, -3);
      return `${countCells(w) - b}/${effectsOf(w, 'burst').length}`;
    };
    const seen = new Set([1, 2, 3, 4, 5, 6].map(outcome));
    expect(seen.size).toBeGreaterThan(2);
  });
});

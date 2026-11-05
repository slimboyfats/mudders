import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('weapon.skipper-last', () => {
  it('goes off once and stops', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const b = countCells(w);
    dropAt(w, 'weapon.skipper-last', 200);
    expect(effectsOf(w, 'burst')).toHaveLength(1);
    expect(countCells(w)).toBeLessThan(b);
  });
});

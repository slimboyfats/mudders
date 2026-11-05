import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.baby-nuke', () => {
  it('carves a bigger crater than a missile', () => {
    const hole = (wpn: string) => {
      const w = flatWorld();
      const b = countCells(w);
      dropAt(w, wpn, 200);
      return b - countCells(w);
    };
    expect(hole('weapon.baby-nuke')).toBeGreaterThan(2 * hole('weapon.missile'));
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.grim-crown-warhead', () => {
  it('out-carves a MIRV warhead', () => {
    const hole = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [20, 380] });
      const b = countCells(w);
      dropAt(w, wpn, 200);
      return b - countCells(w);
    };
    expect(hole('weapon.grim-crown-warhead')).toBeGreaterThan(hole('weapon.mirv-warhead'));
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.nuke', () => {
  it('carves a bigger crater than a Baby Nuke and kills a tank at the centre', () => {
    const hole = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [40, 200] });
      const b = countCells(w);
      dropAt(w, wpn, 200);
      return { cells: b - countCells(w), alive: w.tanks[1]!.alive };
    };
    expect(hole('weapon.nuke').cells).toBeGreaterThan(hole('weapon.baby-nuke').cells);
    expect(hole('weapon.nuke').alive).toBe(false);
  });
});

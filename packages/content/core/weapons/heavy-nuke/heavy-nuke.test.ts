import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.heavy-nuke', () => {
  it('out-carves a Nuke and flattens a tank 60 cells away', () => {
    const hole = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [40, 260] });
      const b = countCells(w);
      dropAt(w, wpn, 200);
      return { cells: b - countCells(w), hp: w.tanks[1]!.health };
    };
    const heavy = hole('weapon.heavy-nuke');
    expect(heavy.cells).toBeGreaterThan(hole('weapon.nuke').cells);
    expect(heavy.hp).toBeLessThanOrEqual(hole('weapon.nuke').hp);
  });
});

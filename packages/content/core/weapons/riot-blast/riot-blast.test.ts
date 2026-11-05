import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.riot-blast', () => {
  it('blows a bigger harmless hole than a Riot Charge', () => {
    const hole = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [20, 380] });
      const b = countCells(w);
      dropAt(w, wpn, 200);
      return { cells: b - countCells(w), hp: w.tanks[0]!.health + w.tanks[1]!.health };
    };
    const r = hole('weapon.riot-blast');
    expect(r.cells).toBeGreaterThan(hole('weapon.riot-charge').cells);
    expect(r.hp).toBe(200);
  });
});

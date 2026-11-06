import { CHILL_POWER } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatten, makeWorld } from '../../../src/testing';

function flatWorld() {
  const w = makeWorld({ map: { width: 600, height: 300 }, tankColumns: [100, 500] });
  flatten(w, 200);
  return w;
}

describe('weapon.frost-bomb', () => {
  it('frosts a thin skin of the ground, not a block, and leaves a small crater', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.frost-bomb', 300);
    const frost = countCells(w, 'material.frost');
    // a skin about three cells deep across most of the 160-cell-wide disc
    expect(frost).toBeGreaterThan(300);
    expect(frost).toBeLessThan(160 * 6);
    expect(w.grid.material[150 * w.grid.width + 300]).toBe(0);
  });

  it('frosts tanks in range: a frosted tank fires at no more than half power for one turn', () => {
    const w = flatWorld();
    w.tanks[1]!.x = 340;
    dropAt(w, 'weapon.frost-bomb', 300);
    expect(w.tanks[1]!.chill).toBe(1);
    expect(w.tanks[0]!.chill).toBe(0);
    expect(CHILL_POWER).toBe(500);
  });

  it('thaws into mud at the end of the third turn, counting the one it was fired in', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.frost-bomb', 300);
    const frost = countCells(w, 'material.frost');
    const end = () => {
      dropAt(w, 'weapon.tracer', 20);
    };
    end();
    expect(countCells(w, 'material.frost')).toBe(frost);
    end();
    expect(countCells(w, 'material.frost')).toBe(0);
    expect(countCells(w, 'material.mud')).toBeGreaterThanOrEqual(frost);
  });
});

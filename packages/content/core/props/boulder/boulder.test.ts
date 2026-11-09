import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatten, groupCells, propWorld } from '../../../src/testing';

describe('prop.boulder', () => {
  it('takes several missiles, then breaks into rubble', () => {
    // on bedrock, so the blasts can't dig out its footing
    const w = propWorld('prop.boulder', 200);
    flatten(w, 150, 'material.rock');
    w.groups.placeAt(w.grid, 'prop.boulder', 200);
    w.grid.clearSettle();
    w.grid.clearReact();
    expect(groupCells(w)).toBeGreaterThan(150);
    let shots = 0;
    while (w.groups.broken[1] === 0 && shots < 12) {
      dropAt(w, 'weapon.missile', 200);
      shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(2);
    expect(w.groups.broken[1]).toBe(1);
    expect(countCells(w, 'material.rubble')).toBeGreaterThan(0);
  });

  it('tips over into rubble when a missile digs the dirt out from under it', () => {
    const w = propWorld('prop.boulder', 200);
    dropAt(w, 'weapon.missile', 200);
    expect(w.groups.broken[1]).toBe(1);
    expect(countCells(w, 'material.rubble')).toBeGreaterThan(0);
  });
});

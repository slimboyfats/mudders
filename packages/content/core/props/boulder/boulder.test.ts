import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld } from '../../../src/testing';

describe('prop.boulder', () => {
  it('takes several missiles, then breaks into rubble', () => {
    const w = propWorld('prop.boulder', 200);
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
});

import { describe, expect, it } from 'vitest';
import { countCells, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.acid-rain', () => {
  it('showers acid that leaves dirt almost untouched', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const b = countCells(w);
    launchAt(w, 'weapon.acid-rain', 150, 120, 1, -2);
    expect(w.zones.length).toBeGreaterThan(5);
    expect(b - countCells(w)).toBeLessThan(80);
  });
});

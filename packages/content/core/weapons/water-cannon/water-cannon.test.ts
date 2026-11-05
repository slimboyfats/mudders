import { describe, expect, it } from 'vitest';
import { countCells, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.water-cannon', () => {
  it('sprays water and shoves a tank it hits', () => {
    const w = flatWorld(150, { tankColumns: [20, 200] });
    launchAt(w, 'weapon.water-cannon', 150, 143, 1, -0.1, 200);
    expect(countCells(w, 'material.water')).toBeGreaterThan(30);
    expect(w.tanks[1]!.x).toBeGreaterThan(200);
  });
});

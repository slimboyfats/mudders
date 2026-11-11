import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.buzzsaw', () => {
  it('lands short, saws along the ground to the tank and bites hard', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    const g = w.grid;
    launchAt(w, 'weapon.buzzsaw', 200, 140, 1, 0);
    expect(w.tanks[1]!.health).toBeLessThan(25);
    // a groove cut along the way: the surface row is gone between landing and tank
    let cut = 0;
    for (let x = 220; x < 270; x++) if (g.material[150 * g.width + x] === 0) cut++;
    expect(cut).toBeGreaterThan(40);
  });
});

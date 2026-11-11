import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('flight.saw', () => {
  it('saws through a wall too tall to climb and reaches the tank behind it', () => {
    const w = flatWorld(150, { tankColumns: [40, 320] });
    const g = w.grid;
    const dirt = w.mats.cellOf('material.dirt');
    for (let y = 130; y < 150; y++)
      for (let x = 250; x < 262; x++) g.material[y * g.width + x] = dirt;
    g.clearSettle();
    launchAt(w, 'weapon.buzzsaw', 200, 140, 1, 0);
    expect(w.tanks[1]!.health).toBeLessThan(50);
  });

  it('runs the way it was fired, not downhill', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    launchAt(w, 'weapon.buzzsaw', 200, 140, -1, 0);
    expect(w.tanks[0]!.lastShotX).toBeLessThan(190);
  });
});

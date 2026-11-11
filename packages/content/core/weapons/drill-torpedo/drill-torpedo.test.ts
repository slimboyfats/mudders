import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.drill-torpedo', () => {
  it('lands short, burrows on and goes off under the enemy tank', () => {
    const w = flatWorld(150, { tankColumns: [20, 300] });
    launchAt(w, 'weapon.drill-torpedo', 100, 140, 1.5, 0.5);
    expect(w.tanks[1]!.health).toBeLessThan(60);
  });

  it('passes under a teammate (who only drops into the caved-in tunnel) to the enemy', () => {
    const w = flatWorld(150, { tankColumns: [20, 200, 300], players: 3, teams: [0, 0, 1] });
    launchAt(w, 'weapon.drill-torpedo', 100, 140, 1.5, 0.5);
    expect(w.tanks[1]!.health).toBeGreaterThan(75);
    expect(w.tanks[2]!.health).toBeLessThan(60);
  });

  it('surfaces on its own when nothing is in reach', () => {
    const w = flatWorld(150, { tankColumns: [20, 30], map: { width: 800, height: 200 } });
    launchAt(w, 'weapon.drill-torpedo', 100, 140, 1.5, 0.5);
    // it ran out of steam well before the right edge and blew a crater there
    const x = w.tanks[0]!.lastShotX;
    expect(x).toBeGreaterThan(250);
    expect(x).toBeLessThan(500);
    expect(w.grid.surfaceY(x)).toBeGreaterThan(150);
  });
});

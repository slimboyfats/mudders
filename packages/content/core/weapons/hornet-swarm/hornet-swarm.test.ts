import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.hornet-swarm', () => {
  it('splits at the top of its arc and the darts find a tank the shell would have missed', () => {
    const hit = (weapon: string) => {
      const w = flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 330] });
      // lobbed to land around column 210, well short of the tank at 330
      launchAt(w, weapon, 60, 140, 3, -3);
      return 100 - w.tanks[1]!.health;
    };
    expect(hit('weapon.missile')).toBe(0);
    expect(hit('weapon.hornet-swarm')).toBeGreaterThan(40);
  });
});

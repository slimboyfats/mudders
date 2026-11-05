import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.heat-seeker', () => {
  it('lands closer to the target than an unguided shell', () => {
    const miss = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [20, 300] });
      launchAt(w, wpn, 60, 120, 2.4, -4.5);
      return Math.abs(w.tanks[0]!.lastShotX - 300);
    };
    expect(miss('weapon.heat-seeker')).toBeLessThan(miss('weapon.missile') - 30);
  });

  it('steers into the tank', () => {
    const w = flatWorld(150, { tankColumns: [20, 300] });
    launchAt(w, 'weapon.heat-seeker', 60, 120, 2.4, -4.5);
    expect(w.tanks[1]!.health).toBeLessThan(80);
  });
});

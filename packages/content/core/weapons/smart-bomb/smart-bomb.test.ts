import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.smart-bomb', () => {
  it('lands closer to the target than an unguided shell', () => {
    const miss = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [20, 300] });
      launchAt(w, wpn, 60, 120, 2.4, -4.5);
      return Math.abs(w.tanks[0]!.lastShotX - 300);
    };
    expect(miss('weapon.smart-bomb')).toBeLessThan(miss('weapon.missile') - 30);
  });
});

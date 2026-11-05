import { describe, expect, it } from 'vitest';
import { FP } from '@mudders/sim';
import { flatWorld } from '../../../src/testing';

describe('flight.homing', () => {
  it('bends toward the nearest enemy tank once armed', () => {
    const path = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [20, 300] });
      const idx = w.weaponByIndex(wpn);
      w.projectiles.push({
        id: 1,
        weapon: idx,
        owner: 0,
        x: 60 * FP,
        y: 120 * FP,
        vx: 2 * FP,
        vy: -3 * FP,
        age: 0,
        alive: true,
        data: [],
      });
      w.phase = 'resolve';
      w.run(40);
      return w.projectiles[0]!.x;
    };
    expect(path('weapon.heat-seeker')).toBeGreaterThan(path('weapon.missile'));
  });
});

import { describe, expect, it } from 'vitest';
import { FP } from '@mudders/sim';
import { flatWorld } from '../../../src/testing';

describe('flight.rail', () => {
  it('flies at a fixed high speed whatever the launch speed, dropping only a little', () => {
    const w = flatWorld(190, { tankColumns: [20, 380] });
    const idx = w.weaponByIndex('weapon.railgun');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 30 * FP,
      y: 50 * FP,
      vx: FP / 4,
      vy: 0,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    w.run(10);
    const p = w.projectiles[0]!;
    expect(Math.round(p.x / FP)).toBe(150);
    expect(p.y / FP - 50).toBeLessThan(3);
  });
});

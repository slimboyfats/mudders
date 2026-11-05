import { describe, expect, it } from 'vitest';
import { FP } from '@mudders/sim';
import { flatWorld } from '../../../src/testing';

describe('flight.beam', () => {
  it('flies straight at fixed speed whatever the launch speed, ignoring gravity', () => {
    const w = flatWorld(150, { tankColumns: [20, 380], wind: 0.02 });
    const idx = w.weaponByIndex('weapon.laser');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 50 * FP,
      y: 100 * FP,
      vx: FP / 4,
      vy: 0,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    w.run(10);
    const p = w.projectiles[0]!;
    expect(p.y).toBe(100 * FP);
    expect(Math.round(p.x / FP)).toBe(90);
  });
});

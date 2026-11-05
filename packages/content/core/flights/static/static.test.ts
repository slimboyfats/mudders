import { describe, expect, it } from 'vitest';
import { FP } from '@mudders/sim';
import { flatWorld } from '../../../src/testing';

describe('flight.static', () => {
  it('hangs where it is until its timer goes off', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const idx = w.weaponByIndex('weapon.singularity-core');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 200 * FP,
      y: 100 * FP,
      vx: 3 * FP,
      vy: 3 * FP,
      age: 0,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    w.run(20);
    expect(w.projectiles[0]!.x).toBe(200 * FP);
    expect(w.projectiles[0]!.y).toBe(100 * FP);
    w.run(40);
    expect(w.projectiles).toHaveLength(0);
  });
});

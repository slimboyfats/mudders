import { describe, expect, it } from 'vitest';
import { FP } from '@mudders/sim';
import { flatWorld } from '../../../src/testing';

describe('flight.orbital-lance', () => {
  it('waits while it locks on, then drops from the top of the map down its column', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    const idx = w.weaponByIndex('weapon.orbital-lance-beam');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 200 * FP + FP / 2,
      y: 150 * FP + FP / 2,
      vx: 0,
      vy: 0,
      age: 0,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    w.run(30);
    const p = w.projectiles[0]!;
    expect(Math.floor(p.y / FP)).toBe(150);
    expect(w.grid.surfaceY(200)).toBe(150);
    w.run(31);
    expect(Math.floor(p.x / FP)).toBe(200);
    expect(Math.floor(p.y / FP)).toBeLessThan(40);
    expect(p.vx).toBe(0);
  });
});

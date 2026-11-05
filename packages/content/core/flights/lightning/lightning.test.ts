import { describe, expect, it } from 'vitest';
import { FP } from '@mudders/sim';
import { flatWorld } from '../../../src/testing';

describe('flight.lightning', () => {
  it('jumps above the highest enemy tank and falls straight down', () => {
    const w = flatWorld(150, { tankColumns: [40, 330] });
    const idx = w.weaponByIndex('weapon.lightning');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 40 * FP,
      y: 140 * FP,
      vx: FP,
      vy: -FP,
      age: 0,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    w.step();
    const p = w.projectiles[0]!;
    expect(Math.floor(p.x / FP)).toBe(330);
    expect(p.vx).toBe(0);
    w.step();
    expect(w.projectiles[0]!.x).toBe(p.x);
  });
});

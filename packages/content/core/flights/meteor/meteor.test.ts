import { describe, expect, it } from 'vitest';
import { FP } from '@mudders/sim';
import { flatWorld } from '../../../src/testing';

function meteor(owner: number) {
  const w = flatWorld(150, { tankColumns: [40, 330] });
  w.projectiles.push({
    id: 1,
    weapon: w.weaponByIndex('weapon.meteor'),
    owner,
    x: 200 * FP,
    y: 140 * FP,
    vx: FP,
    vy: 0,
    age: 0,
    alive: true,
    data: [],
  });
  w.phase = 'resolve';
  w.step();
  return w;
}

describe('flight.meteor', () => {
  it('hides above the map, then streaks down slanted onto its landing column', () => {
    const w = meteor(0);
    const p = w.projectiles[0]!;
    const tx = p.data[0]!;
    expect(tx).toBe(240); // 200 + vx 1 × reach 40
    expect(p.y).toBeLessThan(0);
    let launched = false;
    let lastX = 0;
    for (let i = 0; i < 400 && w.projectiles.length > 0; i++) {
      const q = w.projectiles[0]!;
      if (q.vy > 0) {
        launched = true;
        // coming from the shooter's side (player 0 at column 40): travelling right
        expect(q.vx).toBeGreaterThan(0);
      }
      lastX = Math.floor(q.x / FP);
      w.step();
    }
    expect(launched).toBe(true);
    expect(Math.abs(lastX - tx)).toBeLessThanOrEqual(3);
  });

  it('comes in from the other side for a shooter on the right', () => {
    const w = meteor(1);
    for (let i = 0; i < 200; i++) {
      const q = w.projectiles[0]!;
      if (q.vy > 0) {
        expect(q.vx).toBeLessThan(0);
        return;
      }
      w.step();
    }
    throw new Error('meteor never came in');
  });
});

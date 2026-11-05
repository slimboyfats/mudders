import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld, slopeWorld } from '../../../src/testing';

describe('weapon.roller', () => {
  it('rolls downhill to a tank at the bottom of the slope and goes off there', () => {
    const w = slopeWorld(100, 4, { tankColumns: [20, 300] });
    dropAt(w, 'weapon.roller', 120);
    expect(w.tanks[0]!.lastShotX).toBeGreaterThan(260);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });

  it('stops at the bottom of a valley instead of climbing out', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const g = w.grid;
    // a V-shaped pit around column 200, 20 deep
    for (let x = 170; x <= 230; x++) {
      const d = 20 - Math.floor(Math.abs(x - 200) / 3);
      for (let y = 150; y < 150 + d; y++) g.material[y * g.width + x] = 0;
    }
    g.clearSettle();
    dropAt(w, 'weapon.roller', 182);
    expect(Math.abs(w.tanks[0]!.lastShotX - 200)).toBeLessThan(10);
  });
});

import { describe, expect, it } from 'vitest';
import { dropAt, slopeWorld } from '../../../src/testing';

describe('flight.roller', () => {
  it('rolls downhill after landing and goes off further down the slope', () => {
    const w = slopeWorld(100, 4, { tankColumns: [20, 390] });
    dropAt(w, 'weapon.roller', 120);
    expect(w.tanks[0]!.lastShotX).toBeGreaterThan(150);
  });

  it('rolls left on a slope that falls to the left', () => {
    const w = slopeWorld(100, 4, { tankColumns: [20, 390] });
    const g = w.grid;
    // mirror the slope
    const copy = g.material.slice();
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++)
        g.material[y * g.width + x] = copy[y * g.width + (g.width - 1 - x)]!;
    g.clearSettle();
    dropAt(w, 'weapon.roller', 280);
    expect(w.tanks[0]!.lastShotX).toBeLessThan(250);
  });
});

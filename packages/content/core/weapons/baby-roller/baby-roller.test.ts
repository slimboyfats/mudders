import { describe, expect, it } from 'vitest';
import { dropAt, slopeWorld } from '../../../src/testing';

describe('weapon.baby-roller', () => {
  it('rolls downhill to a tank at the bottom of the slope and goes off there', () => {
    const w = slopeWorld(100, 4, { tankColumns: [20, 300] });
    dropAt(w, 'weapon.baby-roller', 120);
    expect(w.tanks[0]!.lastShotX).toBeGreaterThan(260);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });
});

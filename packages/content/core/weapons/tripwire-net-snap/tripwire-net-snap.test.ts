import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.tripwire-net-snap', () => {
  it('bangs and nets the tank it lands on so it cannot drive', () => {
    const w = flatWorld(150);
    dropAt(w, 'weapon.tripwire-net-snap', 360);
    const t = w.tanks[1]!;
    expect(t.health).toBeLessThan(80);
    expect(t.glue).toBeGreaterThan(0);
    expect(t.driveLeft).toBe(0);
  });
});

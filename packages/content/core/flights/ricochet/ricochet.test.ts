import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld, launchAt, slopeWorld } from '../../../src/testing';

describe('flight.ricochet', () => {
  it('bounces along flat ground five times, then goes off', () => {
    const w = flatWorld(150, { tankColumns: [20, 780] });
    launchAt(w, 'weapon.ricochet-ball', 100, 100, 2, 1);
    const sparks = effectsOf(w, 'ricochet');
    expect(sparks).toHaveLength(5);
    for (let i = 1; i < sparks.length; i++) expect(sparks[i]!.x).toBeGreaterThan(sparks[i - 1]!.x);
    expect(w.tanks[0]!.lastShotX).toBeGreaterThan(sparks[4]!.x);
  });

  it('rebounds off a slope at the mirrored angle, not straight up', () => {
    // ground falling to the right: a shell dropped straight down kicks off to the right
    const w = slopeWorld(60, 2, { tankColumns: [10, 40] });
    launchAt(w, 'weapon.ricochet-ball', 200, 40, 0, 1);
    const sparks = effectsOf(w, 'ricochet');
    expect(sparks.length).toBeGreaterThan(1);
    expect(sparks[1]!.x).toBeGreaterThan(sparks[0]!.x + 4);
  });

  it('goes off at once on a tank in its path', () => {
    const w = flatWorld(150, { tankColumns: [20, 130] });
    launchAt(w, 'weapon.ricochet-ball', 100, 140, 3, 0);
    expect(effectsOf(w, 'ricochet')).toHaveLength(0);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });
});

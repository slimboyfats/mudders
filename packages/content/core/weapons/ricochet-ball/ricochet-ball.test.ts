import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.ricochet-ball', () => {
  it('sparks on each bounce without cratering, then goes off once in a big burst', () => {
    const w = flatWorld(150, { tankColumns: [20, 780] });
    const before = w.grid.surfaceY(200);
    launchAt(w, 'weapon.ricochet-ball', 100, 100, 2, 1);
    const snap = w.snapshot().effectEvents;
    const sparks = snap.filter((e) => e.type === 'ricochet');
    const bursts = snap.filter((e) => e.type === 'ricochetBurst');
    expect(sparks).toHaveLength(5);
    expect(bursts).toHaveLength(1);
    expect(bursts[0]!.radius).toBe(30);
    // the bounces only scorch: the ground under the first one is untouched
    expect(w.grid.surfaceY(sparks[0]!.x)).toBe(150);
    expect(before).toBe(150);
  });

  it('hurts a tank it hits directly', () => {
    const w = flatWorld(150, { tankColumns: [20, 130] });
    launchAt(w, 'weapon.ricochet-ball', 100, 140, 3, 0);
    expect(effectsOf(w, 'ricochetBurst')).toHaveLength(1);
    expect(w.tanks[1]!.health).toBeLessThan(60);
  });
});

import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld, launchAt, slopeWorld } from '../../../src/testing';

describe('flight.drill-torpedo', () => {
  it('follows falling ground down at its running depth', () => {
    const w = slopeWorld(60, 2, { tankColumns: [10, 30] });
    launchAt(w, 'weapon.drill-torpedo', 80, 90, 1.5, 0.5);
    const runs = effectsOf(w, 'drill').filter((e, i, all) => i > 12 && e.x > all[0]!.x);
    expect(runs.length).toBeGreaterThan(20);
    for (const e of runs.slice(0, 20)) {
      const depth = e.y - (60 + Math.floor(e.x / 2));
      expect(depth).toBeGreaterThanOrEqual(6);
      expect(depth).toBeLessThanOrEqual(14);
    }
  });

  it('turns straight up under an enemy tank', () => {
    const w = flatWorld(150, { tankColumns: [20, 260] });
    launchAt(w, 'weapon.drill-torpedo', 100, 140, 1.5, 0.5);
    const runs = effectsOf(w, 'drill');
    const last = runs[runs.length - 1]!;
    expect(Math.abs(last.x - 260)).toBeLessThanOrEqual(6);
    expect(Math.abs(w.tanks[0]!.lastShotX - 260)).toBeLessThanOrEqual(6);
  });

  it('lets the AI predictor see where it first lands', () => {
    const w = flatWorld(150, { tankColumns: [100, 300] });
    const t = w.tanks[0]!;
    const p = w.predict(t, w.weaponByIndex('weapon.drill-torpedo'), 60, 400);
    expect(p.landed).toBe(true);
    expect(p.y).toBeGreaterThanOrEqual(149);
    expect(p.y).toBeLessThanOrEqual(151);
  });
});

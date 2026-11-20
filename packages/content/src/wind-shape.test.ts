import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { flatWorld, passTurns } from './testing';

/**
 * Wind with shape (`rules.windShape`, kernel 0.65.0, `World.windAt`): the wind grows with height
 * over the ground and all but dies in the lee of high ground.
 */

const RULES = { turnTimer: 0, suddenDeath: false };

/** Flat ground at row 150 with a rock ridge 60 rows high over columns 180 to 200. */
function ridge(windShape: boolean, wind: number): World {
  const w = flatWorld(150, { rules: { ...RULES, windShape }, wind });
  const rock = w.mats.cellOf('material.rock');
  for (let y = 90; y < 150; y++) for (let x = 180; x <= 200; x++) w.grid.set(x, y, rock);
  w.grid.clearSettle();
  // the shelter lines are drawn at turn start
  passTurns(w, 2);
  return w;
}

describe('wind with shape', () => {
  it('off unless the rule is set: the same wind everywhere', () => {
    const w = ridge(false, 0.02);
    expect(w.wind).toBeGreaterThan(0);
    expect(w.windAt(230, 140)).toBe(w.wind);
    expect(w.windAt(100, 10)).toBe(w.wind);
  });

  it('grows with height over open ground, from a half to half as much again', () => {
    const w = ridge(true, 0.02);
    const low = w.windAt(60, 149);
    const mid = w.windAt(60, 100);
    const high = w.windAt(60, 0);
    expect(low).toBe(Math.trunc((w.wind * 129) / 256));
    expect(mid).toBeGreaterThan(low);
    expect(high).toBe(Math.trunc((w.wind * 353) / 256));
    expect(w.windAt(60, -200)).toBe(Math.trunc((w.wind * 384) / 256));
  });

  it('all but dies in the lee of a ridge, on the downwind side only', () => {
    const right = ridge(true, 0.02);
    // wind blows right: the lee is right of the ridge
    expect(right.windAt(230, 140)).toBe(Math.trunc((right.wind * 32) / 256));
    expect(right.windAt(150, 140)).toBeGreaterThan(Math.trunc((right.wind * 120) / 256));
    // the shadow falls one row in three columns and is gone 180 columns on
    expect(right.windAt(390, 140)).toBeGreaterThan(Math.trunc((right.wind * 120) / 256));
    const left = ridge(true, -0.02);
    expect(left.windAt(150, 140)).toBe(Math.trunc((left.wind * 32) / 256));
    expect(Math.abs(left.windAt(230, 140))).toBeGreaterThan(Math.trunc((-left.wind * 120) / 256));
  });

  it('a shell fired in the lee is carried less than one fired in the open', () => {
    const drift = (windShape: boolean): number => {
      const w = ridge(windShape, 0.03);
      const calm = ridge(windShape, 0);
      // straight up from a spot right behind the ridge, short enough to stay in its shadow
      const m = w.weaponByIndex('weapon.missile');
      const from = { x: 215, y: 150 };
      return (
        w.predict(w.tanks[0]!, m, 90, 250, from).x -
        calm.predict(calm.tanks[0]!, m, 90, 250, from).x
      );
    };
    expect(drift(false)).toBeGreaterThan(0);
    expect(drift(true)).toBeLessThan(drift(false));
  });
});

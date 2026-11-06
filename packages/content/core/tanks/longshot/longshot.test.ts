import { describe, expect, it } from 'vitest';
import { flatten, makeWorld } from '../../../src/testing';

describe('tank.longshot', () => {
  it('has 85 health', () => {
    expect(makeWorld({ tanks: ['tank.longshot'] }).tanks[0]!.health).toBe(85);
  });

  it('the same aim carries its shell much farther than a Classic', () => {
    const w = makeWorld({
      map: { width: 1600, height: 400 },
      tankColumns: [100, 1500],
      tanks: ['tank.classic', 'tank.longshot'],
      wind: 0,
    });
    flatten(w, 300);
    const [a, b] = w.tanks as [(typeof w.tanks)[0], (typeof w.tanks)[0]];
    b.x = a.x;
    const weapon = w.weaponByIndex('weapon.missile');
    const near = w.predict(a, weapon, 45, 600).x - a.x;
    const far = w.predict(b, weapon, 45, 600).x - b.x;
    // range grows with speed squared: 1.2² ≈ 1.44
    expect(far).toBeGreaterThan(near * 1.3);
  });
});

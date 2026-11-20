import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('gear.mod-fuse', () => {
  it('settles on the ground instead of going off, then blows four seconds after firing', () => {
    const w = flatWorld(150, {
      tankSetup: [{ inventory: { 'gear.mod-fuse': 1, 'weapon.missile': 5 } }],
    });
    const t = w.tanks[0]!;
    const g = w.gear.findIndex((x) => x.id === 'gear.mod-fuse');
    w.applyInput(0, { type: 'useGear', gear: 'gear.mod-fuse' });
    w.applyInput(0, { type: 'selectWeapon', weapon: 'weapon.missile' });
    w.applyInput(0, { type: 'aim', angle: 70, power: 300 });
    w.applyInput(0, { type: 'fire' });
    w.step();
    expect([t.gear[g], t.mod]).toEqual([0, -1]);
    const fired = w.tick;
    let gone = -1;
    let rest = -1;
    for (let i = 0; i < 600 && gone < 0; i++) {
      const p = w.projectiles[0];
      if (!p) gone = w.tick;
      else if (rest < 0 && p.vx === 0 && p.vy === 0) rest = w.tick;
      w.step();
    }
    expect(rest).toBeGreaterThan(fired);
    expect(rest - fired).toBeLessThan(200);
    expect(gone - fired).toBeGreaterThanOrEqual(239);
    expect(gone - fired).toBeLessThanOrEqual(242);
  });
});

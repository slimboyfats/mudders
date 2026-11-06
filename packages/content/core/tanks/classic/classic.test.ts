import { describe, expect, it } from 'vitest';
import { STANDARD_TANK, TANK_H, TANK_W } from '@mudders/sim';
import { loadContent } from '../../../src/index';
import { makeWorld } from '../../../src/testing';

describe('tank.classic', () => {
  it('is the default tank and matches the standard tank exactly', () => {
    const c = loadContent();
    expect(c.get('mode', 'mode.classic').tank).toBe('tank.classic');
    const t = makeWorld().tanks[0]!;
    expect(t.type.id).toBe('tank.classic');
    expect({ ...t.type, id: '' }).toEqual(STANDARD_TANK);
    expect([t.w, t.h, t.health, t.maxHealth, t.shield]).toEqual([TANK_W, TANK_H, 100, 100, 0]);
  });

  it('every tank type trades a strength for a weakness', () => {
    for (const m of loadContent().list('tank')) {
      if (m.id === 'tank.classic') continue;
      const area = (m.body.width * m.body.height) / (TANK_W * TANK_H);
      const ups = [
        m.health > 100,
        m.shield > 0,
        area < 1,
        m.damage > 100,
        m.muzzle > 100,
        m.drive > 100,
      ];
      const downs = [m.health < 100, area > 1, m.damage < 100, m.muzzle < 100, m.drive < 100];
      expect(ups.some(Boolean), m.id).toBe(true);
      expect(downs.some(Boolean), m.id).toBe(true);
    }
  });
});

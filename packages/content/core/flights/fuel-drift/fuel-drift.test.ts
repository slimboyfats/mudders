import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

function puff(vx: number, vy: number, wind = 0) {
  const w = flatWorld(150, { wind });
  const p = {
    id: 1,
    weapon: w.weaponByIndex('weapon.fuel-air-cloud'),
    owner: 0,
    x: 200 * 65536,
    y: 140 * 65536,
    vx: vx * 65536,
    vy: vy * 65536,
    age: 0,
    alive: true,
    data: [] as number[],
  };
  w.projectiles.push(p);
  w.phase = 'resolve';
  return { w, p };
}

describe('flight.fuel-drift', () => {
  it('billows out and slows to a hang under air drag', () => {
    const { w, p } = puff(3, 0);
    w.run(40);
    expect(p.x >> 16).toBeGreaterThan(230);
    expect(p.x >> 16).toBeLessThan(250);
    expect(Math.abs(p.vx)).toBeLessThan(65536 / 4);
  });

  it('settles onto the ground and slides along it, never into it', () => {
    const { w, p } = puff(1, 3);
    for (let i = 0; i < 60; i++) {
      w.step();
      expect(p.alive).toBe(true);
      expect(p.y >> 16).toBeLessThan(150);
    }
    expect(p.y >> 16).toBe(149);
    expect(p.x >> 16).toBeGreaterThan(200);
  });

  it('drifts with the wind', () => {
    const { w, p } = puff(0, 0, 0.02);
    w.run(60);
    expect(p.x >> 16).toBeGreaterThan(205);
  });
});

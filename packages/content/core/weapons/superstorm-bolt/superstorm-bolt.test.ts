import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('weapon.superstorm-bolt', () => {
  it('hangs, then blasts a big crater, hurts a tank and glasses the ground', () => {
    const w = flatWorld(150, { tankColumns: [40, 200] });
    const idx = w.weaponByIndex('weapon.superstorm-bolt');
    w.projectiles.push({
      id: 999,
      weapon: idx,
      owner: 0,
      x: 200 * 65536,
      y: 140 * 65536,
      vx: 0,
      vy: 0,
      age: 100,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let i = 0; i < 10; i++) w.step();
    expect(w.projectiles.length).toBe(1);
    for (let i = 0; i < 1000 && w.phase === 'resolve'; i++) w.step();
    expect(w.tanks[1]!.health).toBeLessThan(80);
    expect(countCells(w, 'material.fulgurite')).toBeGreaterThan(0);
  });
});

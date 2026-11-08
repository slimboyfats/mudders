import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('weapon.superstorm-blast', () => {
  it('blasts a big glassed crater and shoves a tank outside it away', () => {
    const w = flatWorld(150, { tankColumns: [40, 200] });
    const near = w.tanks[1]!;
    const idx = w.weaponByIndex('weapon.superstorm-blast');
    w.projectiles.push({
      id: 999,
      weapon: idx,
      owner: 0,
      x: 260 * 65536,
      y: 148 * 65536,
      vx: 0,
      vy: 0,
      age: 21,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let i = 0; i < 2000 && w.phase === 'resolve'; i++) w.step();
    expect(near.health).toBeLessThan(100);
    expect(near.x).toBeLessThan(200);
    expect(countCells(w, 'material.fulgurite')).toBeGreaterThan(0);
  });
});

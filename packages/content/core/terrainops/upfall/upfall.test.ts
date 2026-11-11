import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { flatWorld } from '../../../src/testing';

describe('terrainop.upfall', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('terrainop.upfall')).toBe(true);
  });

  it('lifts loose ground and tanks in the column, then drops it all', () => {
    const w = flatWorld(150, { map: { width: 400, height: 260 }, tankColumns: [60, 210] });
    const idx = w.weaponByIndex('weapon.upfall');
    w.projectiles.push({
      id: 999,
      weapon: idx,
      owner: 0,
      x: 200 * 65536,
      y: 140 * 65536,
      vx: 0,
      vy: 65536,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    let maxDebris = 0;
    let highest = 999;
    for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) {
      w.step();
      maxDebris = Math.max(maxDebris, w.debris.count);
      highest = Math.min(highest, w.tanks[1]!.y);
    }
    expect(w.phase).toBe('aim');
    expect(maxDebris).toBeGreaterThan(500);
    expect(highest).toBeLessThan(150 - 25);
    // the tank far outside the column never moved
    expect(w.tanks[0]!.y).toBe(150);
    // it came back down and got hurt by the fall
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });
});

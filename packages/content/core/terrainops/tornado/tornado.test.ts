import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.tornado', () => {
  it('sucks dirt up into the air, then drops nearly all of it back', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const before = countCells(w);
    let peak = 0;
    const idx = w.weaponByIndex('weapon.tornado');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 150 * 65536,
      y: 140 * 65536,
      vx: 0,
      vy: 65536,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let n = 0; n < 2000 && w.phase === 'resolve'; n++) {
      w.step();
      peak = Math.max(peak, w.debris.count);
    }
    expect(peak).toBeGreaterThan(300);
    expect(w.debris.count).toBe(0);
    // some is flung off the sides of this small map; most comes back down as terrain
    expect(before - countCells(w)).toBeLessThan(before * 0.1);
  });

  it('leaves rock alone', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const rock = w.mats.cellOf('material.rock');
    w.grid.material.fill(rock, 150 * w.grid.width);
    w.grid.clearSettle();
    dropAt(w, 'weapon.tornado', 200);
    // (the shell's own small burst may chip the impact point)
    for (let x = 210; x < 330; x++) expect(w.grid.surfaceY(x)).toBeLessThanOrEqual(150);
  });
});

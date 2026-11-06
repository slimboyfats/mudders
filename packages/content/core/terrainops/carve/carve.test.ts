import { describe, expect, it } from 'vitest';
import { countCells, flatten, makeWorld } from '../../../src/testing';

describe('terrainop.carve', () => {
  it('carves a disc in dirt and half the radius in rock', () => {
    const w = makeWorld({ map: { width: 400, height: 200 }, tankColumns: [20, 380] });
    flatten(w, 50);
    const rock = w.mats.cellOf('material.rock');
    for (let y = 50; y < 200; y++) for (let x = 200; x < 400; x++) w.grid.set(x, y, rock);
    const before = countCells(w);
    // big-radius impacts straight down onto each half
    w.projectiles.push({
      id: 1,
      weapon: w.weaponByIndex('weapon.baby-nuke-core'),
      owner: 0,
      x: 100 * 65536,
      y: 40 * 65536,
      vx: 0,
      vy: 65536 * 4,
      age: 9,
      alive: true,
      data: [],
    });
    w.projectiles.push({
      id: 2,
      weapon: w.weaponByIndex('weapon.baby-nuke-core'),
      owner: 0,
      x: 300 * 65536,
      y: 40 * 65536,
      vx: 0,
      vy: 65536 * 4,
      age: 9,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let i = 0; i < 200 && w.projectiles.length; i++) w.step();
    let dirtDepth = 0;
    let rockDepth = 0;
    for (let y = 50; y < 200 && w.grid.get(100, y) === 0; y++) dirtDepth++;
    for (let y = 50; y < 200 && w.grid.get(300, y) === 0; y++) rockDepth++;
    expect(countCells(w)).toBeLessThan(before);
    expect(dirtDepth).toBeGreaterThan(5);
    expect(rockDepth).toBeGreaterThan(0);
    expect(rockDepth).toBeLessThan(dirtDepth);
  });
});

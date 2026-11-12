import { describe, expect, it } from 'vitest';
import { damageTypeIndex } from '@mudders/sim';
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

  it('throws part of the dirt it digs: it flies as debris and lands as a lip round the crater', () => {
    const w = makeWorld({ map: { width: 400, height: 200 }, tankColumns: [20, 380] });
    flatten(w, 100);
    const before = countCells(w, 'material.dirt');
    const idx = w.weaponByIndex('weapon.missile');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 200 * 65536,
      y: 94 * 65536,
      vx: 0,
      vy: 65536 * 2,
      age: 9,
      alive: true,
      data: [],
    });
    let flying = 0;
    for (let i = 0; i < 20; i++) {
      w.step();
      flying = Math.max(flying, w.debris.count);
    }
    expect(flying).toBeGreaterThan(100);
    for (let i = 0; i < 600 && !w.quiet; i++) w.step();
    expect(w.debris.count).toBe(0);
    // thrown, not deleted: the debris is ground again, and some of it lies above the old surface
    const lost = before - countCells(w, 'material.dirt');
    let raised = 0;
    for (let x = 100; x < 300; x++) if (w.grid.surfaceY(x) < 100) raised++;
    expect(raised).toBeGreaterThan(10);
    // and the crater is still a crater
    expect(w.grid.surfaceY(200)).toBeGreaterThan(115);
    expect(lost).toBeGreaterThan(400);
  });

  it('only blasts throw dirt: diggers and beams still dig clean', () => {
    const w = makeWorld({ map: { width: 400, height: 200 }, tankColumns: [20, 380] });
    expect(w.mats.ejectBy[w.mats.cellOf('material.dirt')]).toBe(1 << damageTypeIndex('blast'));
  });
});

import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('terrainop.warp', () => {
  it('lifts a tank out of a hill to stand on top of it', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    // a 30-cell mound at x 190..250
    const g = w.grid;
    const dirt = w.mats.cellOf('material.dirt');
    for (let y = 120; y < 150; y++)
      for (let x = 190; x < 250; x++) g.material[y * g.width + x] = dirt;
    w.projectiles.push({
      id: 1,
      weapon: w.weaponByIndex('weapon.teleport-shell'),
      owner: 0,
      x: 220 * 65536,
      y: 100 * 65536,
      vx: 0,
      vy: 65536,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let n = 0; n < 600 && w.phase === 'resolve'; n++) w.step();
    expect(w.tanks[0]!.x).toBe(220);
    expect(w.tanks[0]!.y).toBe(120);
    expect(w.tanks[0]!.health).toBe(100);
  });

  it('steps aside from a tank already standing where it lands', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    dropAt(w, 'weapon.teleport-shell', 300);
    const me = w.tanks[0]!;
    const them = w.tanks[1]!;
    expect(them.x).toBe(300);
    expect(Math.abs(me.x - them.x)).toBeGreaterThanOrEqual(me.half + them.half);
    expect(me.x).toBeLessThan(300);
  });

  it('stays on the map when the shell lands at the very edge', () => {
    const w = flatWorld(150, { tankColumns: [200, 360] });
    dropAt(w, 'weapon.teleport-shell', 1);
    const me = w.tanks[0]!;
    expect(me.x).toBeGreaterThanOrEqual(me.half);
    expect(me.y).toBe(150);
  });

  it('a glued tank fizzles and stays put', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    w.tanks[0]!.glue = 2;
    dropAt(w, 'weapon.teleport-shell', 220);
    expect(w.tanks[0]!.x).toBe(40);
    expect(effectsOf(w, 'warpFizzle')).toHaveLength(1);
  });
});

describe('terrainop.warp swap mode', () => {
  it('lifts the swapped tank out onto a ledge that is taller where it lands', () => {
    const w = flatWorld(150, { tankColumns: [60, 320] });
    const g = w.grid;
    const dirt = w.mats.cellOf('material.dirt');
    // tank 0 stands on a 20-cell plateau
    for (let y = 130; y < 150; y++) for (let x = 40; x < 80; x++) g.material[y * g.width + x] = dirt;
    w.tanks[0]!.y = 130;
    launchAt(w, 'weapon.swap-ray', 72, 126, 4, 0.32);
    expect(w.tanks[1]!.x).toBe(60);
    expect(w.tanks[1]!.y).toBe(130);
    expect(w.tanks[0]!.x).toBe(320);
    expect(w.tanks[0]!.y).toBe(150);
  });

  it('a glued target fizzles and nobody moves', () => {
    const w = flatWorld(150, { tankColumns: [60, 320] });
    w.tanks[1]!.glue = 2;
    launchAt(w, 'weapon.swap-ray', 72, 146, 4, 0);
    expect(w.tanks[0]!.x).toBe(60);
    expect(w.tanks[1]!.x).toBe(320);
  });
});

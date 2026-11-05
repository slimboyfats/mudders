import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('material.lava', () => {
  it('runs downhill, burns a tank sitting in it each turn and cools to rock after three turns', () => {
    const w = flatWorld();
    const lava = w.mats.cellOf('material.lava');
    const t = w.tanks[1]!;
    for (let y = 140; y < 150; y++)
      for (let x = t.x - 10; x < t.x + 10; x++) w.grid.set(x, y, lava);
    w.grid.markDirty(t.x - 10, 140, t.x + 10, 150);
    w.run(120);
    expect(w.grid.get(t.x + 14, 149)).toBe(lava);
    const hp = t.health;
    dropAt(w, 'weapon.riot-charge', 200);
    expect(t.health).toBe(hp - 20);
    for (let i = 0; i < 2; i++) dropAt(w, 'weapon.riot-charge', 200);
    expect(countCells(w, 'material.lava')).toBe(0);
    expect(countCells(w, 'material.rock')).toBeGreaterThan(100);
  });

  it('melts ice it touches', () => {
    const w = flatWorld();
    const lava = w.mats.cellOf('material.lava');
    const ice = w.mats.cellOf('material.ice');
    for (let x = 100; x < 140; x++) w.grid.set(x, 149, ice);
    for (let x = 100; x < 140; x++) w.grid.set(x, 148, lava);
    w.grid.markDirty(100, 148, 140, 149);
    w.run(200);
    expect(countCells(w, 'material.ice')).toBeLessThan(10);
  });
});

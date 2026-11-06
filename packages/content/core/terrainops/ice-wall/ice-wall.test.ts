import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

function column(w: ReturnType<typeof flatWorld>, x: number, cell: number): number {
  let n = 0;
  for (let y = 0; y < w.grid.height; y++) if (w.grid.get(x, y) === cell) n++;
  return n;
}

describe('terrainop.ice-wall', () => {
  it('grows a free-standing wall of ice out of open ground', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.ice-wall', 200);
    const ice = w.mats.cellOf('material.ice');
    expect(column(w, 200, ice)).toBeGreaterThan(40);
    expect(w.grid.surfaceY(200)).toBeLessThan(150 - 38);
    expect(column(w, 220, ice)).toBe(0);
    const cells = countCells(w, 'material.ice');
    expect(cells).toBeGreaterThan(12 * 38);
    expect(cells).toBeLessThan(12 * 60);
  });

  it('grows over a few dozen ticks, bottom first', () => {
    const w = flatWorld();
    const ice = w.mats.cellOf('material.ice');
    dropAt(w, 'weapon.ice-wall', 200, 1);
    let seen = 0;
    let steps = 0;
    while (w.phase === 'resolve' && steps < 400) {
      w.step();
      steps++;
      const n = column(w, 200, ice);
      expect(n).toBeGreaterThanOrEqual(seen);
      seen = n;
    }
    expect(steps).toBeGreaterThan(15);
  });

  it('cages a tank it lands next to, without burying it', () => {
    const w = flatWorld();
    const t = w.tanks[1]!;
    const hp = t.health;
    dropAt(w, 'weapon.ice-wall', t.x + 3);
    const ice = w.mats.cellOf('material.ice');
    expect(t.health).toBe(hp);
    // walls either side of the hull, a roof over the turret, nothing inside the hitbox
    expect(w.grid.get(t.x - t.half - 4, t.y - 2)).toBe(ice);
    expect(w.grid.get(t.x + t.half + 3, t.y - 2)).toBe(ice);
    let roof = false;
    for (let y = t.y - t.h - 1; y > t.y - t.h - 16; y--) roof ||= w.grid.get(t.x, y) === ice;
    expect(roof).toBe(true);
    for (let y = t.y - t.h; y < t.y; y++)
      for (let x = t.x - t.half; x < t.x + t.half; x++) expect(w.grid.get(x, y)).toBe(0);
  });
});

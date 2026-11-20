import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatten, propWorld } from '../../../src/testing';
import type { World } from '@mudders/sim';

/** Water cells lying on the ground (the bottom few rows above a surface at 150). */
function waterOnGround(w: World): number {
  const g = w.grid;
  const water = w.mats.cellOf('material.water');
  let n = 0;
  for (let y = 135; y < 150; y++)
    for (let x = 0; x < g.width; x++) if (g.material[y * g.width + x] === water) n++;
  return n;
}

function onRock(): World {
  const w = propWorld('prop.water-tower', 200);
  flatten(w, 150, 'material.rock');
  w.groups.placeAt(w.grid, 'prop.water-tower', 200);
  w.grid.clearSettle();
  w.grid.clearReact();
  return w;
}

describe('prop.water-tower', () => {
  it('holds its water high up and stays still', () => {
    const w = propWorld('prop.water-tower', 200);
    const water = countCells(w, 'material.water');
    expect(water).toBeGreaterThan(250);
    w.run(200);
    expect(countCells(w, 'material.water')).toBe(water);
    expect(waterOnGround(w)).toBe(0);
    expect(w.quiet).toBe(true);
  });

  it('leaks where the tank is holed', () => {
    const w = onRock();
    // a shell into the side of the tank, low down
    const y = 150 - 44 + 16;
    w.projectiles.push({
      id: 900,
      weapon: w.weaponByIndex('weapon.baby-missile'),
      owner: 0,
      x: (150 * 65536) | 0,
      y: y * 65536,
      vx: 4 * 65536,
      vy: 0,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    w.run(400);
    expect(waterOnGround(w)).toBeGreaterThan(40);
  });

  it('comes down and floods the ground when its legs are blown out', () => {
    const w = onRock();
    let shots = 0;
    while (w.groups.broken[1] === 0 && shots < 12) {
      dropAt(w, 'weapon.missile', 190 + (shots % 3) * 10);
      shots++;
    }
    w.run(600);
    expect(w.groups.broken[1]).toBe(1);
    expect(w.groups.broken[2]).toBe(1);
    expect(waterOnGround(w)).toBeGreaterThan(150);
  });
});

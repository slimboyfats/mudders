import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

/** One drum: a steel ring round a core of barrel fuel, standing on the ground. */
function drum(w: World): void {
  const g = w.grid;
  const steel = w.mats.cellOf('material.steel');
  const fuel = w.mats.cellOf('material.barrel-fuel');
  for (let y = 142; y < 150; y++)
    for (let x = 197; x < 203; x++) {
      const edge = y === 142 || y === 149 || x === 197 || x === 202;
      g.material[y * g.width + x] = edge ? steel : fuel;
    }
  g.markDirty(197, 142, 202, 149);
}

describe('material.barrel-fuel', () => {
  it('stays put while its drum is sealed', () => {
    const w = flatWorld();
    drum(w);
    w.run(100);
    expect(countCells(w, 'material.barrel-fuel')).toBe(24);
  });

  it('bursts and launches the drum once the drum is opened', () => {
    const w = flatWorld();
    drum(w);
    w.run(5);
    w.grid.clearCell(142 * w.grid.width + 199);
    w.grid.markDirty(199, 142, 199, 142);
    w.step();
    w.step();
    expect(countCells(w, 'material.barrel-fuel')).toBe(0);
    const flying = w.weaponByIndex('weapon.flying-barrel');
    expect(w.projectiles.some((p) => p.weapon === flying && p.vy < 0)).toBe(true);
  });
});

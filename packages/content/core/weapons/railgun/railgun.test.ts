import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

/** A dirt wall `thick` columns wide standing on the flat ground, from row `top` down. */
function wall(w: ReturnType<typeof flatWorld>, x0: number, thick: number, top: number): void {
  const g = w.grid;
  const dirt = w.mats.cellOf('material.dirt');
  for (let y = top; y < 150; y++)
    for (let x = x0; x < x0 + thick; x++) g.material[y * g.width + x] = dirt;
  g.clearSettle();
}

describe('weapon.railgun', () => {
  it('punches through a thin wall and hits the tank behind it hard', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    wall(w, 200, 6, 120);
    launchAt(w, 'weapon.railgun', 60, 145, 1, 0);
    expect(w.tanks[1]!.health).toBe(30);
  });

  it('is stopped by a thick hill', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    wall(w, 150, 60, 120);
    launchAt(w, 'weapon.railgun', 60, 145, 1, 0);
    expect(w.tanks[1]!.health).toBe(100);
  });

  it('flies flat through a gale', () => {
    const w = flatWorld(150, { tankColumns: [40, 300], wind: 0.05 });
    launchAt(w, 'weapon.railgun', 60, 140, 1, 0);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });
});

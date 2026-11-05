import { describe, expect, it } from 'vitest';
import { countCells, flatWorld, launchAt } from '../../../src/testing';

describe('flight.digger', () => {
  it('tunnels along its flight line and stops after its length', () => {
    const w = flatWorld(100, { tankColumns: [20, 380], map: { width: 400, height: 400 } });
    launchAt(w, 'weapon.digger', 150, 90, 1, 1);
    // the tunnel's roof caves in (dirt doesn't hold an overhang), so the ground above it sinks
    expect(w.grid.surfaceY(210)).toBeGreaterThan(104);
    expect(w.grid.surfaceY(150)).toBe(100);
    expect(w.projectiles).toHaveLength(0);
  });

  it('comes out of a thin wall and stops', () => {
    const w = flatWorld(190, { tankColumns: [20, 380] });
    const g = w.grid;
    const dirt = w.mats.cellOf('material.dirt');
    for (let x = 200; x < 210; x++)
      for (let y = 100; y < 190; y++) g.material[y * g.width + x] = dirt;
    g.clearSettle();
    const before = countCells(w);
    const ticks = launchAt(w, 'weapon.digger', 180, 140, 2, 0);
    expect(countCells(w)).toBeLessThan(before - 40);
    expect(ticks).toBeLessThan(60);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.volcano', () => {
  it('lifts a tank standing where the cone grows instead of burying it', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    const t = w.tanks[1]!;
    const y0 = t.y;
    dropAt(w, 'weapon.volcano-seed', 310, 3000);
    expect(t.y).toBeLessThan(y0 - 5);
    // nothing solid inside the tank's body
    const g = w.grid;
    for (let x = t.x - t.half + 1; x < t.x + t.half; x++) {
      const m = g.material[(t.y - 2) * g.width + x]!;
      expect(m === 0 || m === w.mats.cellOf('material.lava')).toBe(true);
    }
  });

  it('erupts from the top of the column even after the cone is blown away', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.volcano-seed', 200, 3000);
    const lava0 = countCells(w, 'material.lava');
    dropAt(w, 'weapon.nuke', 200, 3000);
    // the next turn's eruption still throws fresh lava out of the crater floor
    expect(w.snapshot().effectEvents.some((e) => e.type === 'volcanoErupt')).toBe(true);
    expect(countCells(w, 'material.lava') + countCells(w, 'material.rock')).toBeGreaterThan(0);
    expect(lava0).toBeGreaterThan(0);
  });
});

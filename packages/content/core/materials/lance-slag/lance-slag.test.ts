import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('material.lance-slag', () => {
  it('holds a wall upright, burns a tank leaning on it and cools to obsidian after two turns', () => {
    const w = flatWorld();
    const slag = w.mats.cellOf('material.lance-slag');
    const t = w.tanks[1]!;
    // a free-standing slag wall right next to the tank
    for (let y = 120; y < 150; y++) for (let x = t.x + 4; x < t.x + 7; x++) w.grid.set(x, y, slag);
    w.grid.markDirty(t.x + 4, 120, t.x + 7, 150);
    w.run(60);
    expect(w.grid.get(t.x + 5, 120)).toBe(slag);
    const hp = t.health;
    dropAt(w, 'weapon.riot-charge', 200);
    expect(t.health).toBe(hp - 10);
    expect(countCells(w, 'material.lance-slag')).toBeGreaterThan(0);
    dropAt(w, 'weapon.riot-charge', 200);
    expect(countCells(w, 'material.lance-slag')).toBe(0);
    expect(countCells(w, 'material.obsidian')).toBe(90);
  });
});

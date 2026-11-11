import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.magma-lance', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.magma-lance')).toBe(true);
  });

  it('hurts the tank it hits and leaves lava', () => {
    const w = flatWorld(150, { map: { width: 600, height: 260 }, tankColumns: [60, 300] });
    const t = w.tanks[1]!;
    t.shield = 0;
    const h0 = t.health;
    dropAt(w, 'weapon.magma-lance', 300);
    expect(h0 - t.health).toBeGreaterThanOrEqual(50);
    expect(countCells(w, 'material.lava') + countCells(w, 'material.rock')).toBeGreaterThan(0);
  });
});

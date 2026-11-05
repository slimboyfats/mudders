import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.water-cannon-drop', () => {
  it('adds a little water', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const idx = w.weaponByIndex('weapon.water-cannon-drop');
    expect(idx).toBeGreaterThanOrEqual(0);
    dropAt(w, 'weapon.water-cannon-drop', 200, 20);
    expect(countCells(w, 'material.water')).toBeGreaterThan(0);
  });
});

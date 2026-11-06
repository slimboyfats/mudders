import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('material.slag', () => {
  it('lines a meteor crater, glows through the next turn, then cools to meteorite', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.meteor', 200);
    const slag = countCells(w, 'material.slag');
    expect(slag).toBeGreaterThan(20);
    // the next player's turn: still glowing while they aim, cooled when it ends
    dropAt(w, 'weapon.riot-charge', 60);
    expect(countCells(w, 'material.slag')).toBe(0);
    expect(countCells(w, 'material.meteorite')).toBe(slag);
  });

  it('burns a tank sitting in it', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const slag = w.mats.cellOf('material.slag');
    const t = w.tanks[1]!;
    for (let x = t.x - 10; x < t.x + 10; x++) w.grid.set(x, 150, slag);
    const hp = t.health;
    dropAt(w, 'weapon.riot-charge', 200);
    expect(t.health).toBe(hp - 6);
  });
});

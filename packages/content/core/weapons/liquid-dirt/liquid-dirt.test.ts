import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.liquid-dirt', () => {
  it('flows into a pit and sets as dirt', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const g = w.grid;
    for (let x = 210; x < 240; x++) for (let y = 150; y < 170; y++) g.material[y * g.width + x] = 0;
    g.clearSettle();
    const b = countCells(w, 'material.dirt');
    dropAt(w, 'weapon.liquid-dirt', 200);
    expect(countCells(w, 'material.liquid-dirt')).toBe(0);
    expect(countCells(w, 'material.dirt')).toBeGreaterThan(b + 300);
    expect(g.material[169 * g.width + 225]).not.toBe(0);
  });
});

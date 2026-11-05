import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.tectonic-charge', () => {
  it('rolls a wave of dirt out along the surface', () => {
    const w = flatWorld(150, { tankColumns: [20, 300] });
    const b = countCells(w);
    dropAt(w, 'weapon.tectonic-charge', 150);
    expect(Math.abs(countCells(w) - b)).toBeLessThan(400);
    expect(w.grid.surfaceY(150)).toBeGreaterThan(150);
  });

  it('shoves a tank along with the crest', () => {
    const w = flatWorld(150, { tankColumns: [20, 260] });
    dropAt(w, 'weapon.tectonic-charge', 150);
    expect(w.tanks[1]!.x).toBeGreaterThan(260);
    expect(w.tanks[0]!.x).toBeLessThan(20);
  });
});

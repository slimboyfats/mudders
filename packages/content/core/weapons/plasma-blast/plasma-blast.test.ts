import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.plasma-blast', () => {
  it('melts a crater and hurts a tank in it', () => {
    const w = flatWorld(150, { tankColumns: [20, 215] });
    const b = countCells(w);
    dropAt(w, 'weapon.plasma-blast', 200);
    expect(w.tanks[1]!.health).toBeLessThan(80);
    expect(countCells(w)).toBeLessThan(b);
  });
});

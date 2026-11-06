import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.black-hole-mine-core', () => {
  it('drags nearby tanks in and heaps the ground, then collapses', () => {
    const w = flatWorld(150, { tankColumns: [40, 250] });
    const b = countCells(w);
    dropAt(w, 'weapon.black-hole-mine-core', 200);
    expect(w.tanks[1]!.x).toBeLessThan(250);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(countCells(w)).toBeLessThan(b);
  });
});

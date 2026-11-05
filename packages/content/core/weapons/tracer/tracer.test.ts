import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.tracer', () => {
  it('marks where it lands and changes nothing', () => {
    const w = flatWorld(150, { tankColumns: [20, 205] });
    const b = countCells(w);
    dropAt(w, 'weapon.tracer', 200);
    expect(countCells(w)).toBe(b);
    expect(w.tanks[1]!.health).toBe(100);
    expect(w.tanks[0]!.lastShotX).toBe(200);
  });
});

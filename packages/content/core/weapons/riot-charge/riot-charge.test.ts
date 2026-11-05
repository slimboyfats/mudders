import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.riot-charge', () => {
  it('blows a hole and hurts nobody it does not drop', () => {
    const w = flatWorld(150, { tankColumns: [40, 252] });
    const b = countCells(w);
    dropAt(w, 'weapon.riot-charge', 200);
    expect(b - countCells(w)).toBeGreaterThan(1000);
    expect(w.tanks[1]!.health).toBe(100);
  });
});

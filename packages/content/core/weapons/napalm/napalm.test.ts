import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.napalm', () => {
  it('splashes burning jelly that hurts a tank and leaves ash', () => {
    const w = flatWorld(150, { tankColumns: [40, 206] });
    dropAt(w, 'weapon.napalm', 200);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(countCells(w, 'material.ash')).toBeGreaterThan(0);
    expect(countCells(w, 'material.napalm')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.acid-cloud-drop', () => {
  it('pits plain dirt where it lands', () => {
    const w = flatWorld(150);
    const before = countCells(w);
    dropAt(w, 'weapon.acid-cloud-drop', 200);
    expect(countCells(w)).toBeLessThan(before - 10);
  });

  it('stings a tank it hits', () => {
    const w = flatWorld(150);
    dropAt(w, 'weapon.acid-cloud-drop', 360);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });
});

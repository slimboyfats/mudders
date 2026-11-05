import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.resonator', () => {
  it('makes the next explosion in its field twice as big, once', () => {
    const plain = flatWorld(150, { tankColumns: [20, 380] });
    let b = countCells(plain);
    dropAt(plain, 'weapon.missile', 200);
    const missile = b - countCells(plain);

    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.resonator', 200);
    expect(w.zones).toHaveLength(1);
    b = countCells(w);
    dropAt(w, 'weapon.missile', 210);
    expect(b - countCells(w)).toBeGreaterThan(missile * 3);
    expect(w.zones).toHaveLength(0);
  });
});

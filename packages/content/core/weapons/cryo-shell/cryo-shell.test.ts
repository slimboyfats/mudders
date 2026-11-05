import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.cryo-shell', () => {
  it('leaves an ice block that a missile barely dents', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.cryo-shell', 200);
    const ice = countCells(w, 'material.ice');
    dropAt(w, 'weapon.missile', 200);
    expect(ice - countCells(w, 'material.ice')).toBeLessThan(ice / 3);
  });
});

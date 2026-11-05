import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.harden', () => {
  it('freezes the ground under the impact', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.cryo-shell', 200);
    expect(w.grid.get(200, 155)).toBe(w.mats.cellOf('material.ice'));
  });
});

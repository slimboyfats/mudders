import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.magma-glob', () => {
  it('lands as a small pool of lava', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    dropAt(w, 'weapon.magma-glob', 200);
    expect(countCells(w, 'material.lava')).toBeGreaterThan(5);
  });
});

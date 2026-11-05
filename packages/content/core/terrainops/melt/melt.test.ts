import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.melt', () => {
  it('turns dirt into lava', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.magma-bomb', 200, 30);
    expect(countCells(w, 'material.lava')).toBeGreaterThan(500);
  });
});

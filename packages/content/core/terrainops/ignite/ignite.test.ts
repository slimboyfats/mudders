import { describe, expect, it } from 'vitest';
import { countCells, dropAt, propWorld } from '../../../src/testing';

describe('terrainop.ignite', () => {
  it('sets wood and leaves alight but not dirt', () => {
    const w = propWorld('prop.tree', 200);
    const dirt = countCells(w, 'material.dirt');
    dropAt(w, 'weapon.incendiary', 200, 20);
    expect(countCells(w, 'material.fire')).toBeGreaterThan(30);
    expect(countCells(w, 'material.dirt')).toBeGreaterThan(dirt - 50);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.convert', () => {
  it('converts only the listed materials, sweeping out over several ticks', () => {
    const w = flatWorld();
    const ticks = dropAt(w, 'weapon.cryo-shell', 200);
    expect(ticks).toBeGreaterThan(3);
    expect(countCells(w, 'material.ice')).toBeGreaterThan(1000);
    expect(countCells(w, 'material.rock')).toBe(0);
  });
});

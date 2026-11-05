import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.coat', () => {
  it('coats the top few cells of the ground and leaves the material alone', () => {
    const w = flatWorld();
    const dirt = w.mats.cellOf('material.dirt');
    dropAt(w, 'weapon.oil-slick', 200);
    const oil = w.mats.cellOf('material.oil');
    const W = w.grid.width;
    const s = w.grid.surfaceY(200);
    for (let y = s; y < s + 4; y++) expect(w.grid.coating[y * W + 200]).toBe(oil);
    expect(w.grid.coating[(s + 6) * W + 200]).toBe(0);
    expect(w.grid.material[s * W + 200]).toBe(dirt);
  });
});

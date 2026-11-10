import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.oil-slick', () => {
  it('oils the ground, which then burns at the first spark', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.oil-slick', 200);
    const oil = w.mats.cellOf('material.oil');
    const oiled = () => w.grid.coating.reduce((n, c) => n + (c === oil ? 1 : 0), 0);
    const before = oiled();
    expect(before).toBeGreaterThan(200);
    dropAt(w, 'weapon.incendiary', 200);
    // the whole oiled surface goes up, not just the impact point
    expect(before - oiled()).toBeGreaterThan(70);
    expect(countCells(w, 'material.ash')).toBeGreaterThan(50);
  });
});

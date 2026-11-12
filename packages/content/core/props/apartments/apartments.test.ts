import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld, wreckCells } from '../../../src/testing';

describe('prop.apartments', () => {
  it('absorbs missiles, cracks, then collapses into rubble with its roof', () => {
    const w = propWorld('prop.apartments', 200);
    expect(countCells(w, 'material.brick')).toBeGreaterThan(1000);
    expect(countCells(w, 'material.concrete')).toBeGreaterThan(250);
    const walls = 1;
    dropAt(w, 'weapon.missile', 185);
    expect(w.groups.broken[walls]).toBe(0);
    expect(w.groups.integrity[walls]).toBeLessThan(520);
    let shots = 1;
    while (w.groups.broken[walls] === 0 && shots < 16) {
      dropAt(w, 'weapon.missile', 185 + (shots % 4) * 10);
      shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(w.groups.broken[walls]).toBe(1);
    expect(groupCells(w)).toBe(0);
    // the wreck: slabs of wall and roof that lie as pieces, and rubble
    expect(wreckCells(w, 'material.rubble', 'material.brick', 'material.concrete')).toBeGreaterThan(
      500,
    );
    expect(w.quiet).toBe(true);
  });
});

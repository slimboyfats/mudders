import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.acid-flask', () => {
  it('lets out a puddle of acid that eats into the dirt where it lands', () => {
    const w = flatWorld();
    const dirt = countCells(w, 'material.dirt');
    dropAt(w, 'weapon.acid-flask', 200);
    // half a disc of radius 14 of acid, some of it already spent on the ground below
    const acid = countCells(w, 'material.acid');
    const eaten = dirt - countCells(w, 'material.dirt');
    expect(acid + eaten).toBeGreaterThan(200);
    expect(acid + eaten).toBeLessThan(420);
    expect(eaten).toBeGreaterThan(20);
    // the hole is under the hit
    expect(w.grid.surfaceY(200)).toBeGreaterThan(150);
    expect(w.tanks.every((t) => t.health === 100)).toBe(true);
  });
});

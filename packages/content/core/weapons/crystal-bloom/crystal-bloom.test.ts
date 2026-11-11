import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.crystal-bloom', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.crystal-bloom')).toBe(true);
  });

  it('leaves standing crystal behind once the shot resolves', () => {
    const w = flatWorld(150);
    dropAt(w, 'weapon.crystal-bloom', 200, 3000);
    expect(w.phase).toBe('aim');
    expect(w.ops).toHaveLength(0);
    expect(countCells(w, 'material.crystal')).toBeGreaterThan(500);
  });
});

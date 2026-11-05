import { describe, expect, it } from 'vitest';
import { countCells, dropAt, propWorld } from '../../../src/testing';

describe('material.glass', () => {
  it('shatters the windows at the first hit while the walls stand', () => {
    const w = propWorld('prop.house', 200);
    expect(countCells(w, 'material.glass')).toBe(60);
    dropAt(w, 'weapon.baby-missile', 189);
    expect(countCells(w, 'material.glass')).toBeLessThan(60);
    expect(w.groups.broken[2]).toBe(1);
    expect(w.groups.broken[1]).toBe(0);
  });
});

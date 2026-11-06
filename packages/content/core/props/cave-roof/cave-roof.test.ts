import { describe, expect, it } from 'vitest';
import { countCells, dropAt, propWorld } from '../../../src/testing';

describe('prop.cave-roof', () => {
  it('knocks stone loose where it is hit, and the loose stone lands as dirt', () => {
    const w = propWorld('prop.cave-roof', 200);
    const lime0 = countCells(w, 'material.limestone');
    const dirt0 = countCells(w, 'material.dirt');
    expect(lime0).toBeGreaterThan(50);
    expect(w.groups.isLocal(1)).toBe(true);
    dropAt(w, 'weapon.baby-missile', 196);
    for (let i = 0; i < 1000 && !w.quiet; i++) w.step();
    expect(countCells(w, 'material.limestone')).toBeLessThan(lime0);
    expect(countCells(w, 'material.dirt')).toBeGreaterThan(dirt0 - 200);
    expect(w.quiet).toBe(true);
  });
});

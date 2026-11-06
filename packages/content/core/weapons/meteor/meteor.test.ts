import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.meteor', () => {
  it('blasts a fiery crater lined with glowing slag', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const before = countCells(w);
    dropAt(w, 'weapon.meteor', 200);
    expect(countCells(w)).toBeLessThan(before);
    expect(countCells(w, 'material.slag')).toBeGreaterThan(20);
    expect(w.snapshot().effectEvents.filter((e) => e.type === 'fireball')).toHaveLength(1);
  });
});

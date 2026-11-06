import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('weapon.mud-geyser-glob', () => {
  it('splats and leaves a small heap of mud', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.mud-geyser-glob', 200);
    expect(effectsOf(w, 'mudSplat')).toHaveLength(1);
    const mud = countCells(w, 'material.mud');
    expect(mud).toBeGreaterThan(5);
    expect(mud).toBeLessThan(60);
  });
});

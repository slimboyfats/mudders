import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, flatWorld } from '../../../src/testing';

describe('material.burning-fuel', () => {
  it('burns away and pops now and then while it does', () => {
    const w = flatWorld();
    const g = w.grid;
    const fire = w.mats.cellOf('material.burning-fuel');
    for (let y = 150; y < 158; y++)
      for (let x = 150; x <= 250; x++) g.material[y * g.width + x] = fire;
    g.markDirty(150, 150, 250, 158);
    effectsOf(w, 'shake');
    let pops = 0;
    for (let t = 0; t < 400; t++) {
      w.step();
      if (t % 20 === 0) pops += effectsOf(w, 'shake').length;
    }
    pops += effectsOf(w, 'shake').length;
    expect(countCells(w, 'material.burning-fuel')).toBe(0);
    expect(pops).toBeGreaterThan(1);
  });
});

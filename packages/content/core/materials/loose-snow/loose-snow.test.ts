import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.loose-snow', () => {
  it('runs out into a heap instead of standing as a column', () => {
    const w = flatWorld(150);
    const g = w.grid;
    const cell = w.mats.cellOf('material.loose-snow');
    // a 4-wide, 30-tall pillar dropped on flat ground
    for (let y = 90; y < 120; y++)
      for (let x = 200; x < 204; x++) g.material[y * g.width + x] = cell;
    g.markDirty(200, 90, 203, 149);
    for (let t = 0; t < 600; t++) w.step();
    let top = g.height;
    for (let x = 170; x < 234; x++) top = Math.min(top, g.surfaceY(x));
    expect(150 - top).toBeLessThan(15);
    expect(countCells(w, 'material.loose-snow')).toBe(120);
  });
});

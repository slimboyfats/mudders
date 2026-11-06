import { describe, expect, it } from 'vitest';
import { countCells, flatWorld, passTurns } from '../../../src/testing';

describe('weather.snow', () => {
  it('piles snow on the ground a cell at a time, but never on the tanks', () => {
    const w = flatWorld(150, { weather: 'weather.snow' });
    passTurns(w, 1);
    const s1 = countCells(w, 'material.snow');
    expect(s1).toBeGreaterThan(100);
    passTurns(w, 5);
    for (let i = 0; i < 60; i++) w.step();
    const s2 = countCells(w, 'material.snow');
    expect(s2).toBeGreaterThan(s1 * 2);
    const snow = w.mats.cellOf('material.snow');
    for (const t of w.tanks) {
      for (let x = t.x - t.half; x <= t.x + t.half; x++)
        for (let y = 0; y < 150; y++) expect(w.grid.get(x, y)).not.toBe(snow);
    }
  });

  it('stops piling at maxDepth', () => {
    const w = flatWorld(150, { weather: 'weather.snow' });
    passTurns(w, 60);
    const snow = w.mats.cellOf('material.snow');
    const g = w.grid;
    let deepest = 0;
    for (let x = 0; x < g.width; x++) {
      let d = 0;
      for (let y = 0; y < g.height; y++) if (g.get(x, y) === snow) d++;
      deepest = Math.max(deepest, d);
    }
    expect(deepest).toBeGreaterThan(8);
    expect(deepest).toBeLessThanOrEqual(13);
  });

  it('leaves no one-cell pits between the drifts', () => {
    const w = flatWorld(150, { weather: 'weather.snow' });
    passTurns(w, 10);
    for (let i = 0; i < 120; i++) w.step();
    const g = w.grid;
    let pits = 0;
    for (let x = 1; x < g.width - 1; x++) {
      const y = g.surfaceY(x);
      if (y - 2 >= Math.max(g.surfaceY(x - 1), g.surfaceY(x + 1))) pits++;
    }
    expect(pits).toBeLessThanOrEqual(4);
  });
});

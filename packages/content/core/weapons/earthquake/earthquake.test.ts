import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.earthquake', () => {
  it('drops a ledge far from the impact', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const g = w.grid;
    const dirt = w.mats.cellOf('material.dirt');
    // an overhanging ledge at columns 300..340, rows 120..124, standing on a pillar at 300..304
    for (let x = 300; x < 340; x++)
      for (let y = 120; y < 125; y++) g.material[y * g.width + x] = dirt;
    for (let x = 300; x < 305; x++)
      for (let y = 125; y < 150; y++) g.material[y * g.width + x] = dirt;
    g.clearSettle();
    w.step();
    expect(g.material[122 * g.width + 330]).toBe(dirt);
    dropAt(w, 'weapon.earthquake', 100);
    let ledge = 0;
    for (let x = 310; x < 340; x++) if (g.material[122 * g.width + x] !== 0) ledge++;
    expect(ledge).toBeLessThan(10);
  });
});

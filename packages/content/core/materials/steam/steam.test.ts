import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.steam', () => {
  it('water on lava boils off as steam that rises and thins away', () => {
    const w = flatWorld();
    const lava = w.mats.cellOf('material.lava');
    const water = w.mats.cellOf('material.water');
    const steam = w.mats.cellOf('material.steam');
    for (let x = 180; x < 220; x++) w.grid.set(x, 149, lava);
    for (let x = 180; x < 220; x++) for (let y = 140; y < 149; y++) w.grid.set(x, y, water);
    w.grid.markDirty(179, 139, 221, 150);
    let most = 0;
    let top = 1e9;
    for (let t = 0; t < 300; t++) {
      w.step();
      let n = 0;
      for (let i = 0; i < w.grid.size; i++)
        if (w.grid.gas[i] === steam) {
          n++;
          top = Math.min(top, Math.floor(i / w.grid.width));
        }
      most = Math.max(most, n);
    }
    expect(most).toBeGreaterThan(5);
    expect(top).toBeLessThan(120);
    w.run(1500);
    let left = 0;
    for (let i = 0; i < w.grid.size; i++) if (w.grid.gas[i] === steam) left++;
    expect(left).toBe(0);
  });
});

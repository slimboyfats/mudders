import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('material.obsidian', () => {
  it('never moves, and a blast carves it at a smaller radius than dirt', () => {
    const w = flatWorld();
    const obs = w.mats.cellOf('material.obsidian');
    for (let y = 100; y < 110; y++) for (let x = 190; x < 210; x++) w.grid.set(x, y, obs);
    w.grid.markDirty(190, 100, 210, 110);
    w.run(60);
    expect(w.grid.get(200, 100)).toBe(obs);
    // a blast at the slab's top edge digs less obsidian than it would dirt
    const dug = (cell: number) => {
      const v = flatWorld(150, { map: { width: 400, height: 200 } });
      for (let y = 60; y < 150; y++) for (let x = 0; x < 400; x++) v.grid.set(x, y, cell);
      v.grid.markDirty(0, 60, 399, 149);
      const before = v.grid.material.reduce((n, m) => n + (m === cell ? 1 : 0), 0);
      dropAt(v, 'weapon.baby-missile', 200);
      return before - v.grid.material.reduce((n, m) => n + (m === cell ? 1 : 0), 0);
    };
    expect(dug(obs)).toBeLessThan(dug(w.mats.cellOf('material.dirt')) / 2);
  });
});

import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';
import { loadContent } from '../../../src/index';

describe('terrainop.shave', () => {
  it('cuts a very flat, very wide slab: tall at the centre, thin at the rim', () => {
    const m = loadContent().get('terrainop', 'terrainop.shave') as unknown as Record<
      string,
      number
    >;
    expect(m.height).toBeGreaterThan(m.depth! * 10);
  });

  it('only cuts above the impact row (plus a few cells): a flat floor stays flat', () => {
    const w = flatWorld(150);
    const dirt = w.mats.cellOf('material.dirt');
    for (let x = 230; x < 250; x++) for (let y = 120; y < 150; y++) w.grid.set(x, y, dirt);
    w.grid.markDirty(0, 0, 399, 199);
    const idx = w.weaponByIndex('weapon.daisy-cutter');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 200 * 65536,
      y: 140 * 65536,
      vx: 0,
      vy: 65536,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let n = 0; n < 2000 && w.phase === 'resolve'; n++) w.step();
    // the block is shaved off; far away the floor is untouched
    expect(w.grid.surfaceY(240)).toBeGreaterThan(140);
    expect(w.grid.surfaceY(390)).toBe(150);
  });
});

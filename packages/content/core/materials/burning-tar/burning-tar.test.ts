import { describe, expect, it } from 'vitest';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.burning-tar', () => {
  it('spreads through tar it touches, and water quenches it into crust', () => {
    const w = flatWorld(150);
    const tar = w.mats.cellOf('material.tar');
    const burning = w.mats.cellOf('material.burning-tar');
    for (let y = 150; y < 154; y++) for (let x = 100; x < 200; x++) w.grid.set(x, y, tar);
    w.grid.set(100, 150, burning);
    w.grid.markDirty(100, 150, 100, 150);
    for (let i = 0; i < 600 && countCells(w, 'material.tar') > 0; i++) w.step();
    expect(countCells(w, 'material.tar')).toBe(0);
    expect(countCells(w, 'material.burning-tar')).toBe(400);
    const water = w.mats.cellOf('material.water');
    for (let y = 140; y < 150; y++) for (let x = 100; x < 200; x++) w.grid.set(x, y, water);
    w.grid.markDirty(100, 140, 199, 149);
    for (let i = 0; i < 300; i++) w.step();
    // the surface is quenched into crust: no burning tar left open to the air
    expect(countCells(w, 'material.scorch')).toBeGreaterThan(80);
    for (let x = 100; x < 200; x++) expect(w.grid.get(x, w.grid.surfaceY(x))).not.toBe(burning);
  });

  it('burns tanks at the end of the turn', () => {
    const m = flatWorld(150).mats;
    expect(m.contactDamage[m.cellOf('material.burning-tar')]).toBeGreaterThan(0);
  });
});

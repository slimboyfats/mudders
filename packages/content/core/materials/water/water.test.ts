import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('material.water', () => {
  it('quenches lava into rock', () => {
    const w = flatWorld();
    const water = w.mats.cellOf('material.water');
    const lava = w.mats.cellOf('material.lava');
    for (let x = 240; x < 260; x++) for (let y = 146; y < 150; y++) w.grid.set(x, y, lava);
    for (let y = 100; y < 140; y++) for (let x = 230; x < 240; x++) w.grid.set(x, y, water);
    w.grid.markDirty(230, 100, 260, 150);
    w.run(60);
    expect(countCells(w, 'material.rock')).toBeGreaterThan(5);
  });

  it('pours into a basin, levels out into a lake that stays, and the world goes quiet', () => {
    const w = flatWorld();
    const water = w.mats.cellOf('material.water');
    // a basin 120 wide and 20 deep
    for (let x = 140; x < 260; x++) for (let y = 150; y < 170; y++) w.grid.set(x, y, 0);
    w.grid.markDirty(140, 150, 260, 170);
    w.run(10);
    // a column of water poured in at one side
    for (let y = 60; y < 140; y++) for (let x = 145; x < 160; x++) w.grid.set(x, y, water);
    w.grid.markDirty(145, 60, 160, 140);
    let t = 0;
    while (!w.quiet && t < 3000) {
      w.step();
      t++;
    }
    expect(w.quiet).toBe(true);
    // runs fast: the lake reaches the far bank in well under a few seconds of settling
    expect(t).toBeLessThan(900);
    const cells = countCells(w, 'material.water');
    expect(cells).toBeGreaterThan(1100);
    // level: every column's top within two cells of the others
    let hi = 1e9;
    let lo = -1;
    for (let x = 142; x < 258; x++) {
      let y = 0;
      while (y < 200 && w.grid.get(x, y) !== water) y++;
      hi = Math.min(hi, y);
      lo = Math.max(lo, y);
    }
    expect(lo - hi).toBeLessThanOrEqual(2);
    // and it stays: a long wait later it is all still there
    w.run(1200);
    expect(countCells(w, 'material.water')).toBe(cells);
  });

  it('splashes: a shell into a pond throws drops of water out over the banks', () => {
    const w = flatWorld();
    const water = w.mats.cellOf('material.water');
    // a pond 60 wide and 20 deep, full to the brim
    for (let x = 170; x < 230; x++) for (let y = 150; y < 170; y++) w.grid.set(x, y, water);
    w.grid.markDirty(170, 150, 230, 170);
    w.run(5);
    const before = countCells(w, 'material.water');
    let flying = 0;
    const step = w.step.bind(w);
    w.step = () => {
      step();
      let n = 0;
      for (let k = 0; k < w.debris.count; k++) if (w.debris.mat[k] === water) n++;
      flying = Math.max(flying, n);
    };
    dropAt(w, 'weapon.missile', 200);
    w.step = step;
    w.run(300);
    expect(flying).toBeGreaterThan(50);
    // drops that cleared the banks run off over the dry ground beside the pond
    let out = 0;
    for (let y = 0; y < 150; y++)
      for (let x = 0; x < 400; x++) if ((x < 168 || x > 232) && w.grid.get(x, y) === water) out++;
    expect(out).toBeGreaterThan(5);
    // most of the pond survives the blast as water somewhere
    expect(countCells(w, 'material.water')).toBeGreaterThan(before * 0.6);
  });
});

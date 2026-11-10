import { describe, expect, it } from 'vitest';
import {
  countCells,
  dropAt,
  effectsOf,
  flatWorld,
  groupCells,
  propWorld,
} from '../../../src/testing';

describe('material.leaf', () => {
  it('drifts down like sand when nothing holds it up', () => {
    const w = flatWorld();
    const l = w.mats.cellOf('material.leaf');
    for (let y = 100; y < 110; y++) for (let x = 195; x < 205; x++) w.grid.set(x, y, l);
    w.grid.markDirty(195, 100, 205, 110);
    w.run(300);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(140);
  });

  it('is blown off a tree by a blast beyond its crater, trunk left standing', () => {
    const w = propWorld('prop.tree', 200);
    const leaves = countCells(w, 'material.leaf');
    const wood = countCells(w, 'material.wood');
    // a missile 44 cells away: its crater and heat miss the tree, its pressure doesn't
    dropAt(w, 'weapon.missile', 244);
    const left = countCells(w, 'material.leaf');
    expect(left).toBeLessThan(leaves * 0.75);
    expect(countCells(w, 'material.wood')).toBe(wood);
    expect(groupCells(w)).toBeGreaterThan(wood - 1);
    expect(effectsOf(w, 'blowOff').length).toBeGreaterThan(10);
    expect(w.quiet).toBe(true);
  });

  it('strips the side facing the blast first', () => {
    const w = propWorld('prop.tree', 200);
    const side = (a: number, b: number): number => {
      const l = w.mats.cellOf('material.leaf');
      let n = 0;
      for (let y = 100; y < 150; y++) for (let x = a; x < b; x++) if (w.grid.get(x, y) === l) n++;
      return n;
    };
    const near0 = side(201, 212);
    const far0 = side(189, 200);
    dropAt(w, 'weapon.missile', 245);
    expect(near0 - side(201, 212)).toBeGreaterThan(far0 - side(189, 200));
  });

  it('keeps its leaves behind a hill', () => {
    const w = propWorld('prop.tree', 200);
    const dirt = w.mats.cellOf('material.dirt');
    // a ridge between the tree and the blast
    for (let y = 90; y < 150; y++) for (let x = 218; x < 226; x++) w.grid.set(x, y, dirt);
    w.grid.clearSettle();
    const leaves = countCells(w, 'material.leaf');
    dropAt(w, 'weapon.missile', 252);
    expect(countCells(w, 'material.leaf')).toBeGreaterThan(leaves * 0.9);
    // the same blast without the ridge strips it
    const bare = propWorld('prop.tree', 200);
    dropAt(bare, 'weapon.missile', 252);
    expect(countCells(bare, 'material.leaf')).toBeLessThan(leaves * 0.9);
  });

  it('flies much further from a shockwave', () => {
    const w = propWorld('prop.tree', 200);
    const leaves = countCells(w, 'material.leaf');
    dropAt(w, 'weapon.shockwave', 320);
    expect(countCells(w, 'material.leaf')).toBeLessThan(leaves * 0.8);
    expect(countCells(w, 'material.wood')).toBeGreaterThan(0);
  });
});

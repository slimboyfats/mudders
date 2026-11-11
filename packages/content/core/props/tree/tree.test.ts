import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld } from '../../../src/testing';

describe('prop.tree', () => {
  it('holds its sliding canopy up until the trunk breaks', () => {
    const w = propWorld('prop.tree', 200);
    const leaves = countCells(w, 'material.leaf');
    w.grid.markDirty(180, 100, 220, 150);
    w.run(200);
    expect(countCells(w, 'material.leaf')).toBe(leaves);
    expect(w.grid.surfaceY(200)).toBeLessThan(125);
    dropAt(w, 'weapon.heavy-shockwave', 225);
    expect(groupCells(w)).toBe(0);
    expect(countCells(w, 'material.splinter')).toBeGreaterThan(20);
  });

  it('burns from an incendiary hit', () => {
    const w = propWorld('prop.tree', 200);
    dropAt(w, 'weapon.incendiary', 200);
    expect(countCells(w, 'material.wood') + countCells(w, 'material.leaf')).toBeLessThan(40);
    expect(countCells(w, 'material.ash')).toBeGreaterThan(100);
    expect(w.quiet).toBe(true);
  });

  it('falls once half its trunk hangs over a hole, but not for a one-cell nick', () => {
    // trunk columns 199..202, ground at row 150
    const dug = (a: number, b: number): number => {
      const w = propWorld('prop.tree', 200);
      for (let x = a; x <= b; x++) for (let y = 150; y < 175; y++) w.grid.set(x, y, 0);
      w.grid.markDirty(180, 120, 220, 175);
      w.run(300);
      return groupCells(w);
    };
    expect(dug(199, 199)).toBeGreaterThan(250);
    expect(dug(199, 200)).toBe(0);
  });
});

describe("prop.tree in a blast's heat", () => {
  it('catches fire when a blast goes off close by, and burns down', () => {
    const w = propWorld('prop.tree', 200);
    dropAt(w, 'weapon.missile', 230);
    for (let n = 0; n < 1500 && !w.quiet; n++) w.step();
    // (the crater's rim slumps under the tree, so part of it drops into the hole before it burns)
    expect(countCells(w, 'material.ash')).toBeGreaterThan(25);
  });

  it('only loses leaves to one further off', () => {
    const w = propWorld('prop.tree', 200);
    dropAt(w, 'weapon.missile', 260);
    for (let n = 0; n < 1500 && !w.quiet; n++) w.step();
    expect(countCells(w, 'material.ash')).toBe(0);
    expect(countCells(w, 'material.wood')).toBeGreaterThan(90);
  });
});

describe('prop.tree falling', () => {
  it('is blown apart instead when the blast is close', () => {
    const w = propWorld('prop.tree', 200);
    dropAt(w, 'weapon.shockwave', 222);
    for (let n = 0; n < 1500 && !w.quiet; n++) w.step();
    expect(countCells(w, 'material.log')).toBe(0);
    expect(countCells(w, 'material.splinter')).toBeGreaterThan(40);
  });

  it('snaps at the trunk and falls away at the edge of a blast, leaving a stump and a log', () => {
    const w = propWorld('prop.tree', 200);
    const wood = countCells(w, 'material.wood');
    dropAt(w, 'weapon.shockwave', 252);
    for (let n = 0; n < 1500 && !w.quiet; n++) w.step();
    expect(w.quiet).toBe(true);
    // a stump of trunk stays where it grew
    const stump = countCells(w, 'material.wood');
    expect(stump).toBeGreaterThan(0);
    expect(stump).toBeLessThan(12);
    // the rest lies as a log on the side away from the blast, down on the ground (or on the dirt the blast heaped up)
    const log = w.mats.cellOf('material.log');
    let left = 0;
    let right = 0;
    let high = 0;
    for (let y = 100; y < 170; y++)
      for (let x = 150; x < 250; x++) {
        if (w.grid.get(x, y) !== log) continue;
        if (x < 199) left++;
        else if (x > 202) right++;
        if (y < 125) high++;
      }
    expect(left).toBeGreaterThan(wood / 2);
    expect(right).toBeLessThan(left / 4);
    expect(high).toBe(0);
    expect(groupCells(w)).toBe(0);
  });

  it('tips the way it leans once it is undermined on one side', () => {
    const w = propWorld('prop.tree', 200);
    // dig the ground away to the right of the trunk and under its right half
    for (let x = 201; x <= 230; x++) for (let y = 150; y < 175; y++) w.grid.set(x, y, 0);
    w.grid.markDirty(160, 100, 240, 175);
    for (let n = 0; n < 1500 && !w.quiet; n++) w.step();
    expect(w.quiet).toBe(true);
    expect(groupCells(w)).toBe(0);
    expect(countCells(w, 'material.log')).toBeGreaterThan(40);
  });
});

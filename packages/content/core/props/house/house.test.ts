import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatten, groupCells, propWorld } from '../../../src/testing';

describe('prop.house', () => {
  it('absorbs a missile without losing wall cells, then cracks and collapses into rubble', () => {
    // on bedrock, so the blasts can't dig out its footing (that alone brings it down)
    const w = propWorld('prop.house', 200);
    flatten(w, 150, 'material.rock');
    w.groups.placeAt(w.grid, 'prop.house', 200);
    w.grid.clearSettle();
    w.grid.clearReact();
    const walls = countCells(w, 'material.brick');
    expect(walls).toBeGreaterThan(400);
    expect(groupCells(w)).toBeGreaterThan(700);
    // a hit on the wall face is absorbed by the walls' integrity
    dropAt(w, 'weapon.missile', 188);
    const wallSlot = 1;
    expect(w.groups.broken[wallSlot]).toBe(0);
    expect(w.groups.integrity[wallSlot]).toBeLessThan(450);
    let shots = 1;
    while (w.groups.broken[wallSlot] === 0 && shots < 12) {
      dropAt(w, 'weapon.missile', 188 + (shots % 3) * 8);
      shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(w.groups.broken[wallSlot]).toBe(1);
    expect(countCells(w, 'material.rubble')).toBeGreaterThan(50);
    expect(groupCells(w)).toBe(0);
    expect(w.quiet).toBe(true);
  });

  it('collapses when the ground under it is dug away', () => {
    const w = propWorld('prop.house', 200);
    for (let x = 175; x < 225; x++) for (let y = 150; y < 175; y++) w.grid.set(x, y, 0);
    w.grid.markDirty(175, 150, 225, 175);
    w.run(400);
    expect(groupCells(w)).toBe(0);
    expect(countCells(w, 'material.rubble')).toBeGreaterThan(300);
  });

  // structure (§4c): footing columns 183..216, ground at row 150
  function dug(a: number, b: number): World {
    const w = propWorld('prop.house', 200);
    for (let x = a; x <= b; x++) for (let y = 150; y < 175; y++) w.grid.set(x, y, 0);
    w.grid.markDirty(150, 140, 250, 175);
    w.run(300);
    return w;
  }
  /** Intact prop cells in columns a..b. */
  function heldIn(w: World, a: number, b: number): number {
    let n = 0;
    for (let y = 0; y < w.grid.height; y++)
      for (let x = a; x <= b; x++) if (w.grid.group[y * w.grid.width + x] !== 0) n++;
    return n;
  }

  it('stands with a small notch under a corner or the middle', () => {
    expect(groupCells(dug(183, 185))).toBe(797);
    expect(groupCells(dug(198, 202))).toBe(797);
  });

  it('tears off only the part over the hole; the side on the ground stays up', () => {
    const w = dug(183, 199);
    expect(heldIn(w, 176, 194)).toBe(0); // nothing floats over the hole
    expect(heldIn(w, 201, 220)).toBeGreaterThan(350); // the right half still stands
    expect(w.groups.broken[1]).toBe(0);
    expect(countCells(w, 'material.rubble')).toBeGreaterThan(100);
    expect(countCells(w, 'material.cracked-brick')).toBeGreaterThan(5); // the torn edge
  });

  it('loses its middle over a wide gap but keeps both ends', () => {
    const w = dug(194, 205);
    expect(heldIn(w, 198, 201)).toBe(0);
    expect(heldIn(w, 183, 190)).toBeGreaterThan(100);
    expect(heldIn(w, 209, 216)).toBeGreaterThan(100);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld } from '../../../src/testing';

describe('prop.house', () => {
  it('absorbs a missile without losing wall cells, then cracks and collapses into rubble', () => {
    const w = propWorld('prop.house', 200);
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
});

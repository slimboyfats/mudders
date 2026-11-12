import { describe, expect, it } from 'vitest';
import { countCells, dropAt, groupCells, propWorld, wreckCells } from '../../../src/testing';

// Slots in manifest order: base 1, middle 2, top 3, then each section's windows 4–6.
const BASE = 1;
const MIDDLE = 2;
const TOP = 3;
const TOP_WINDOWS = 6;

describe('prop.tower', () => {
  it('stands a hundred rows tall in concrete and glass', () => {
    const w = propWorld('prop.tower', 200, 180, { map: { width: 400, height: 240 } });
    expect(countCells(w, 'material.concrete')).toBeGreaterThan(1500);
    expect(countCells(w, 'material.glass')).toBeGreaterThan(400);
    expect(w.grid.surfaceY(200)).toBeLessThan(90);
  });

  it('loses its top section to hits on the roof while the base stands', () => {
    const w = propWorld('prop.tower', 200, 180, { map: { width: 400, height: 240 } });
    let shots = 0;
    while (w.groups.broken[TOP] === 0 && shots < 16) {
      dropAt(w, 'weapon.missile', 192 + (shots % 3) * 8);
      shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(2);
    expect(w.groups.broken[TOP]).toBe(1);
    expect(w.groups.broken[TOP_WINDOWS]).toBe(1);
    expect(w.groups.broken[BASE]).toBe(0);
    expect(wreckCells(w, 'material.rubble', 'material.concrete')).toBeGreaterThan(100);
    expect(w.quiet).toBe(true);
  });

  it('comes down whole when the ground under it is dug away', () => {
    const w = propWorld('prop.tower', 200, 180, { map: { width: 400, height: 240 } });
    for (let x = 180; x < 220; x++) for (let y = 180; y < 200; y++) w.grid.set(x, y, 0);
    w.grid.markDirty(180, 180, 220, 200);
    w.run(600);
    expect(w.groups.broken[BASE]).toBe(1);
    expect(w.groups.broken[MIDDLE]).toBe(1);
    expect(w.groups.broken[TOP]).toBe(1);
    expect(groupCells(w)).toBe(0);
    // slabs that fell lie as concrete; the small bits are rubble
    expect(wreckCells(w, 'material.rubble', 'material.concrete')).toBeGreaterThan(800);
  });
});

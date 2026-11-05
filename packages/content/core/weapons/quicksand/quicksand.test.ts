import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.quicksand', () => {
  it('slides a tank on the slope downhill', () => {
    const w = flatWorld(150, { tankColumns: [40, 215] });
    const dirt = w.mats.cellOf('material.dirt');
    for (let x = 150; x < 260; x++)
      for (let y = 150 - Math.max(0, 50 - Math.abs(x - 200)); y < 150; y++) w.grid.set(x, y, dirt);
    w.grid.markDirty(150, 100, 260, 150);
    w.run(5);
    w.tanks[1]!.y = w.grid.surfaceY(215);
    dropAt(w, 'weapon.quicksand', 200);
    expect(w.tanks[1]!.y).toBeGreaterThan(140);
  });

  it('sinks a tank on flat ground a few cells into the mud, then it sets', () => {
    const w = flatWorld(150, { tankColumns: [40, 200] });
    const t = w.tanks[1]!;
    const y0 = t.y;
    dropAt(w, 'weapon.quicksand', 200);
    w.run(400);
    expect(t.alive).toBe(true);
    expect(t.y - y0).toBeGreaterThanOrEqual(3);
    expect(t.y - y0).toBeLessThanOrEqual(4 + 8);
    expect(t.sunk).toBeGreaterThan(0);
  });
});

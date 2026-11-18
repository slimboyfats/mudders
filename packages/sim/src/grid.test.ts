import { describe, expect, it } from 'vitest';
import { Grid } from './grid';

describe('Grid', () => {
  it('reads and writes in bounds only', () => {
    const g = new Grid(10, 5);
    g.set(3, 2, 7);
    expect(g.get(3, 2)).toBe(7);
    g.set(-1, 0, 1);
    g.set(10, 0, 1);
    expect(g.get(-1, 0)).toBe(0);
    expect(g.surfaceY(3)).toBe(2);
    expect(g.surfaceY(4)).toBe(5);
    expect(g.surfaceY(-1)).toBe(5);
  });

  it('finds every column surface at once, the same as column by column', () => {
    const out = new Int32Array(40).fill(-7);
    // widths that go by words of four cells and one that does not
    for (const w of [36, 37]) {
      const g = new Grid(w, 23);
      let r = 12345;
      for (let x = 0; x < w; x++) {
        if (x % 9 === 4) continue; // open to the floor
        for (let y = 0; y < 23; y++) {
          r = (Math.imul(r, 1103515245) + 12345) >>> 0;
          if (r >>> 28 < (x < 20 ? 1 : 6)) g.set(x, y, 1 + (r & 3));
        }
      }
      out.fill(-7);
      g.surfaces(out);
      for (let x = 0; x < w; x++) expect(out[x]).toBe(g.surfaceY(x));
      expect(out[w]).toBe(-7);
    }
    const empty = new Grid(8, 4);
    empty.surfaces(out);
    expect(Array.from(out.subarray(0, 8))).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
  });

  it('tracks a settle region from the top down to the dirty rect', () => {
    const g = new Grid(100, 50);
    expect(g.settling).toBe(false);
    g.markDirty(10, 20, 20, 30);
    expect([g.settleMinX, g.settleMaxX, g.settleMaxY]).toEqual([9, 21, 31]);
    g.markDirty(50, 5, 60, 8);
    expect([g.settleMinX, g.settleMaxX, g.settleMaxY]).toEqual([9, 61, 31]);
    g.clearSettle();
    expect(g.settling).toBe(false);
    g.markDirty(200, 200, 300, 300);
    expect(g.settling).toBe(false);
  });

  it('merges overlapping render rects and collapses many into one', () => {
    const g = new Grid(100, 100);
    g.markDirty(0, 0, 9, 9);
    g.markDirty(5, 5, 14, 14);
    expect(g.takeRenderRects()).toEqual([{ x: 0, y: 0, w: 15, h: 15 }]);
    expect(g.takeRenderRects()).toEqual([]);
    for (let i = 0; i < 12; i++) g.markDirty(i * 8, i * 8, i * 8 + 1, i * 8 + 1);
    const rects = g.takeRenderRects();
    expect(rects.length).toBeLessThanOrEqual(8);
    const r = rects.at(-1)!;
    expect(r.x + r.w).toBeGreaterThanOrEqual(90);
  });

  it('clips render rects to the map, so a padded rect at an edge still uploads', () => {
    const g = new Grid(100, 50);
    g.addRenderRect(-32, 10, 40, 2);
    g.addRenderRect(90, 45, 40, 20);
    g.addRenderRect(200, 0, 5, 5);
    expect(g.takeRenderRects()).toEqual([
      { x: 0, y: 10, w: 8, h: 2 },
      { x: 90, y: 45, w: 10, h: 5 },
    ]);
  });
});

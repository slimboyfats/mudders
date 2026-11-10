import { describe, expect, it } from 'vitest';
import { SWAY_LEAF, SWAY_NEAR, bend, swayField, swayLooks, swayWind } from './sway';

const LEAF = 13;
const WOOD = 9;
const DIRT = 1;

/** w × h grid with ground from row `ground` down. */
function grid(w: number, h: number, ground: number): Uint8Array {
  const t = new Uint8Array(w * h);
  for (let y = ground; y < h; y++) for (let x = 0; x < w; x++) t[y * w + x] = DIRT;
  return t;
}

const looks = swayLooks([
  { cell: LEAF, sway: 1 },
  { cell: WOOD, sway: 0.7, limb: true },
]);

function field(t: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  swayField(t, w, h, looks, out, new Int32Array(h));
  return out;
}

describe('sway field', () => {
  it('bends a tree from the root: the higher the cell, the more it sways', () => {
    const w = 20;
    const h = 60;
    const t = grid(w, h, 50);
    for (let y = 10; y < 50; y++) t[y * w + 10] = WOOD;
    for (let y = 5; y < 20; y++)
      for (let x = 6; x < 15; x++) if (x !== 10 || y < 10) t[y * w + x] = LEAF;
    const f = field(t, w, h);
    const at = (x: number, y: number): number => f[y * w + x]!;
    expect(at(10, 49) & 127).toBe(2); // the root stays put
    expect(at(10, 30) & 127).toBeGreaterThan(at(10, 45) & 127);
    expect(at(10, 12) & 127).toBeGreaterThan(at(10, 30) & 127);
    expect(at(10, 30) & SWAY_LEAF).toBe(0);
    expect(at(8, 8) & SWAY_LEAF).toBe(SWAY_LEAF);
    // every cell of a row bends alike, so the crown keeps its shape
    expect(at(6, 12) & 127).toBe(at(13, 12) & 127);
    // air beside the tree is marked, the ground under it and far air are not
    expect(at(16, 10)).toBe(SWAY_NEAR);
    expect(at(1, 30)).toBe(0);
    expect(at(10, 55)).toBe(0);
  });

  it('keeps wood without a canopy still: house walls and roofs do not sway', () => {
    const w = 20;
    const h = 40;
    const t = grid(w, h, 30);
    for (let y = 10; y < 30; y++) for (let x = 5; x < 15; x++) t[y * w + x] = WOOD;
    expect(swayField(t, w, h, looks, new Uint8Array(w * h), new Int32Array(h))).toBe(false);
  });

  it('bends as height to the power 1.5', () => {
    expect(bend(0)).toBe(0);
    expect(bend(28)).toBe(1);
    expect(bend(7)).toBeCloseTo(0.125);
    expect(bend(500)).toBeCloseTo(2 * Math.SQRT2);
  });

  it('leans with the wind and rocks harder in a strong one', () => {
    const calm = swayWind(0, true);
    const gale = swayWind(-0.02, true);
    expect(calm.lean).toBe(0);
    expect(calm.amp).toBeGreaterThan(0);
    expect(gale.lean).toBeLessThan(-1);
    expect(gale.amp).toBeGreaterThan(calm.amp);
    expect(gale.k).toBeLessThan(0);
    expect(swayWind(0.012, false).rustle).toBe(0);
  });
});

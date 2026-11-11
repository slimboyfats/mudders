import { describe, expect, it } from 'vitest';
import { apronSize, buildApron } from './apron';

const DIRT = 1;
const ROCK = 2;
const WATER = 3;

/** A w×h map: dirt from `surface(x)` down, rock in the bottom quarter, water in `lake` columns. */
function map(
  w: number,
  h: number,
  surface: (x: number) => number,
  lake?: [number, number, number],
) {
  const t = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    const s = surface(x);
    for (let y = s; y < h; y++) t[y * w + x] = y >= (h * 3) / 4 ? ROCK : DIRT;
    if (lake && x >= lake[0] && x < lake[1]) for (let y = lake[2]; y < s; y++) t[y * w + x] = WATER;
  }
  return t;
}

const top = new Uint8Array(256);
top[DIRT] = 1;
const liquid = new Uint8Array(256);
liquid[WATER] = 1;

function surfaceAt(a: { width: number; height: number; cells: Uint8Array }, ax: number): number {
  for (let y = 0; y < a.height; y++) {
    const m = a.cells[y * a.width + ax]!;
    if (m !== 0 && m !== WATER) return y;
  }
  return a.height;
}

describe('apron', () => {
  it('sizes at least half the map each way, in even cells', () => {
    const s = apronSize(801, 401);
    expect(s.side % 2).toBe(0);
    expect(s.below % 2).toBe(0);
    expect(s.side).toBeGreaterThanOrEqual(400);
    expect(s.below).toBeGreaterThanOrEqual(200);
  });

  it('copies the map in and carries the ground on past each edge without a step', () => {
    const w = 300;
    const h = 120;
    const t = map(w, h, (x) => 60 + Math.round(10 * Math.sin(x / 20)));
    const a = buildApron(t, w, h, top, liquid);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) expect(a.cells[y * a.width + a.side + x]).toBe(t[y * w + x]);
    }
    const left = surfaceAt(a, a.side);
    const right = surfaceAt(a, a.side + w - 1);
    expect(Math.abs(surfaceAt(a, a.side - 1) - left)).toBeLessThanOrEqual(1);
    expect(Math.abs(surfaceAt(a, a.side + w) - right)).toBeLessThanOrEqual(1);
    // the land rolls on, not flat and not off the map
    const sky = new Set<number>();
    for (let k = 0; k < a.side; k++) sky.add(surfaceAt(a, k));
    expect(sky.size).toBeGreaterThan(3);
    for (const s of sky) expect(s).toBeLessThan(h);
  });

  it('fills under the map with its deepest ground, never air', () => {
    const w = 200;
    const h = 100;
    const a = buildApron(
      map(w, h, () => 50),
      w,
      h,
      top,
      liquid,
    );
    for (let y = h; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) expect(a.cells[y * a.width + x]).toBe(ROCK);
    }
  });

  it('lets a lake against the edge carry on out', () => {
    const w = 200;
    const h = 100;
    const a = buildApron(
      map(w, h, (x) => (x > 150 ? 80 : 50), [150, 200, 60]),
      w,
      h,
      top,
      liquid,
    );
    expect(a.cells[65 * a.width + a.side + w + 4]).toBe(WATER);
  });
});

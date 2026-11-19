import type { MaterialManifest } from '@mudders/shared';
import { describe, expect, it } from 'vitest';
import { DebrisPool } from './debris';
import { Grid } from './grid';
import { MaterialTable } from './materials';
import { Scratch } from './scratch';
import { settleStep } from './settle';
import { supportPass } from './support';

const mat = (
  id: string,
  cell: number,
  settle: MaterialManifest['settle'],
  span?: number,
): MaterialManifest => ({
  id,
  schemaVersion: 1,
  meta: { name: id, description: id, since: 'test@1.0.0' },
  cell,
  settle,
  density: 1,
  strength: {},
  cohesion: 0,
  coating: false,
  ...(span === undefined ? {} : { span }),
});
const DIRT = 1;
const ROCK = 2;
const FLOAT = 3;
const mats = new MaterialTable([
  mat('material.dirt', DIRT, 'fall'),
  mat('material.rock', ROCK, 'static', 8),
  mat('material.floatstone', FLOAT, 'static'),
]);
const W = 200;
const H = 100;
const fx = { emit: () => undefined };

/** Dirt ground from row 60, a rock slab `thick` rows on it, a pit under columns a..b. */
function world(thick: number, a: number, b: number): { g: Grid; scratch: Scratch; d: DebrisPool } {
  const g = new Grid(W, H);
  g.material.fill(DIRT, 60 * W);
  for (let y = 60; y < 60 + thick; y++) for (let x = 0; x < W; x++) g.material[y * W + x] = ROCK;
  for (let y = 60 + thick; y < H; y++) for (let x = a; x <= b; x++) g.material[y * W + x] = 0;
  g.markDirty(0, 0, W - 1, H - 1);
  const scratch = new Scratch(g.size);
  const d = new DebrisPool();
  // the dirt walls of the pit are fine as they are: only the rock is in question
  let t = 0;
  while (g.settling && t < 500) settleStep(g, mats, t++, 1e9);
  return { g, scratch, d };
}

function rockOver(g: Grid, a: number, b: number, thick: number): number {
  let n = 0;
  for (let y = 60; y < 60 + thick; y++)
    for (let x = a; x <= b; x++) if (g.material[y * W + x] === ROCK) n++;
  return n;
}

describe('supportPass', () => {
  it('leaves a slab alone while every column stands', () => {
    const { g, scratch, d } = world(4, 0, -1);
    expect(supportPass(g, mats, scratch, d, fx)).toBe(0);
    expect(g.structMaxX).toBe(-1);
  });

  it('holds a bridge within twice its reach and drops the middle of a wider one', () => {
    // 4 rows of span-8 rock reach 4 cells (give or take one): a 6-wide gap bridges, a 20-wide one loses its middle
    const ok = world(4, 100, 105);
    expect(supportPass(ok.g, mats, ok.scratch, ok.d, fx)).toBe(0);
    const wide = world(4, 100, 119);
    const lost = supportPass(wide.g, mats, wide.scratch, wide.d, fx);
    expect(lost).toBeGreaterThan(30);
    expect(lost).toBeLessThan(60);
    expect(wide.d.count).toBe(lost);
    // both ends of the bridge stay, the middle is gone
    expect(wide.g.material[60 * W + 100]).toBe(ROCK);
    expect(wide.g.material[60 * W + 119]).toBe(ROCK);
    expect(wide.g.material[62 * W + 110]).toBe(0);
  });

  it('reaches further the thicker the shelf', () => {
    // 16 rows reach 16: the same 20-wide gap now bridges
    const { g, scratch, d } = world(16, 100, 119);
    expect(supportPass(g, mats, scratch, d, fx)).toBe(0);
    expect(rockOver(g, 100, 119, 16)).toBe(320);
  });

  it('breaks a cantilever past its reach along a ragged line, as debris of its own material', () => {
    const { g, scratch, d } = world(8, 100, W - 1);
    const lost = supportPass(g, mats, scratch, d, fx);
    // 8 rows reach 8 (give or take a cell): columns 100..~107 stay, the rest comes off
    expect(rockOver(g, 100, 106, 8)).toBe(56);
    expect(rockOver(g, 110, W - 1, 8)).toBe(0);
    expect(lost).toBeGreaterThan(700);
    let t = 0;
    while ((d.count > 0 || g.settling) && t < 400) {
      d.step(g, 1024, mats);
      settleStep(g, mats, t++, 1e9);
    }
    expect(d.count).toBe(0);
    let rock = 0;
    for (let i = 0; i < g.size; i++) if (g.material[i] === ROCK) rock++;
    expect(rock).toBe(8 * W);
  });

  it('hangs from a material without a span and from a prop group', () => {
    const { g, scratch, d } = world(4, 100, W - 1);
    for (let y = 64; y < 70; y++) g.material[y * W + 150] = FLOAT;
    for (let y = 64; y < 70; y++) g.group[y * W + 180] = 1;
    for (let y = 64; y < 70; y++) g.material[y * W + 180] = DIRT;
    g.markDirty(0, 0, W - 1, H - 1);
    supportPass(g, mats, scratch, d, fx);
    expect(g.material[60 * W + 150]).toBe(ROCK);
    expect(g.material[60 * W + 180]).toBe(ROCK);
    expect(g.material[60 * W + 130]).toBe(0);
    expect(g.material[60 * W + 165]).toBe(0);
  });
});

describe('supportPass, four columns a look', () => {
  it('releases the same cells as the cell by cell walk on a map three columns wider', () => {
    // a width that is a multiple of four takes the wide path; three columns of air to the right
    // change nothing about what hangs, and put the same terrain on the plain path
    let r = 4242;
    const rnd = (n: number): number => {
      r = (Math.imul(r, 1103515245) + 12345) >>> 0;
      return (r >>> 8) % n;
    };
    for (let round = 0; round < 12; round++) {
      const w = 96;
      const h = 64;
      const cells = new Uint8Array(w * h);
      cells.fill(DIRT, 40 * w);
      // rock shelves, floatstone and loose blobs over pits
      for (let k = 0; k < 14; k++) {
        const x0 = rnd(w - 30);
        const y0 = 8 + rnd(40);
        const len = 4 + rnd(40);
        const thick = 1 + rnd(5);
        const m = k % 5 === 4 ? FLOAT : ROCK;
        for (let y = y0; y < Math.min(h, y0 + thick); y++)
          for (let x = x0; x < Math.min(w, x0 + len); x++) cells[y * w + x] = m;
      }
      for (let k = 0; k < 6; k++) {
        const x0 = rnd(w - 12);
        const wd = 3 + rnd(10);
        const top = 30 + rnd(20);
        for (let y = top; y < h; y++) for (let x = x0; x < x0 + wd; x++) cells[y * w + x] = 0;
      }
      const run = (width: number): { lost: number; cells: Uint8Array } => {
        const g = new Grid(width, h);
        for (let y = 0; y < h; y++) g.material.set(cells.subarray(y * w, y * w + w), y * width);
        g.markDirty(0, 0, width - 1, h - 1);
        const lost = supportPass(g, mats, new Scratch(g.size), new DebrisPool(), fx);
        const out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) out.set(g.material.subarray(y * width, y * width + w), y * w);
        return { lost, cells: out };
      };
      const a = run(w);
      const b = run(w + 3);
      expect(a.lost).toBe(b.lost);
      expect(a.cells).toEqual(b.cells);
    }
  });
});

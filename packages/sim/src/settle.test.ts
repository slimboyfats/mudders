import type { MaterialManifest } from '@mudders/shared';
import { describe, expect, it } from 'vitest';
import { DebrisPool } from './debris';
import { Grid, grainShade } from './grid';
import { MaterialTable } from './materials';
import { MAX_FALL_SPEED, settleStep } from './settle';

const mat = (id: string, cell: number, settle: MaterialManifest['settle']): MaterialManifest => ({
  id,
  schemaVersion: 1,
  meta: { name: id, description: id, since: 'test@1.0.0' },
  cell,
  settle,
  density: 1,
  strength: { blast: 2 },
  cohesion: 0,
  coating: false,
});
const mats = new MaterialTable([
  mat('material.dirt', 1, 'fall'),
  mat('material.sand', 2, 'slide'),
  mat('material.rock', 3, 'static'),
  mat('material.water', 4, 'flow'),
]);

function run(g: Grid, max = 300, cap = 1e9): number {
  let t = 0;
  while (g.settling && t < max) settleStep(g, mats, t++, cap);
  return t;
}

describe('MaterialTable', () => {
  it('maps ids to cells and scales strength', () => {
    expect(mats.cellOf('material.sand')).toBe(2);
    expect(() => mats.cellOf('material.nope')).toThrow();
    expect(mats.strengthOf(3, 0)).toBe(512);
    expect(mats.strengthOf(3, 1)).toBe(256);
    expect(mats.strengthOf(0, 0)).toBe(0);
    expect(
      () => new MaterialTable([mat('material.a', 1, 'fall'), mat('material.b', 1, 'fall')]),
    ).toThrow();
  });
});

describe('settleStep', () => {
  it('loosened cells of a fall material with a repose slump off a sheer wall to that slope, and no further', () => {
    const loose = new MaterialTable([
      { ...mat('material.dirt', 1, 'fall'), repose: 2 },
      mat('material.rock', 3, 'static'),
    ]);
    const W = 40;
    const H = 30;
    const g = new Grid(W, H);
    // a block of dirt 10 wide and 12 tall on a rock floor, sheer on both sides
    for (let x = 0; x < W; x++) g.set(x, H - 1, 3);
    for (let y = H - 13; y < H - 1; y++) for (let x = 15; x < 25; x++) g.set(x, y, 1);
    // shaken loose, with steps to spare
    for (let i = 0; i < g.size; i++) if (g.material[i] === 1) g.cellState[i] = 60;
    g.markDirty(0, 0, W - 1, H - 1);
    let t = 0;
    while (g.settling && t < 400) settleStep(g, loose, t++, 1e9);
    expect(g.settling).toBe(false);
    // nothing lost
    let n = 0;
    const top: number[] = [];
    for (let x = 0; x < W; x++) {
      let h = 0;
      for (let y = 0; y < H - 1; y++) {
        if (g.get(x, y) === 1) {
          n++;
          if (h === 0) h = H - 1 - y;
        }
      }
      top.push(h);
    }
    expect(n).toBe(120);
    // it spread, and no step between neighbouring columns is more than the repose
    expect(top[14]).toBeGreaterThan(0);
    expect(top[25]).toBeGreaterThan(0);
    for (let x = 1; x < W; x++) expect(Math.abs(top[x]! - top[x - 1]!)).toBeLessThanOrEqual(2);
    // but it is no sand pile: the middle still stands well above a 45 degree heap
    expect(Math.max(...top)).toBeGreaterThanOrEqual(9);
  });

  it('firm ground with a repose stands sheer, and loose ground firms up once its steps are spent', () => {
    const loose = new MaterialTable([
      { ...mat('material.dirt', 1, 'fall'), repose: 1 },
      mat('material.rock', 3, 'static'),
    ]);
    const g = new Grid(30, 20);
    for (let x = 0; x < 30; x++) g.set(x, 19, 3);
    for (let y = 9; y < 19; y++) for (let x = 12; x < 16; x++) g.set(x, y, 1);
    g.markDirty(0, 0, 29, 19);
    let t = 0;
    while (g.settling && t < 200) settleStep(g, loose, t++, 1e9);
    for (let y = 9; y < 19; y++) for (let x = 12; x < 16; x++) expect(g.get(x, y)).toBe(1);
    // one loose cell on the corner slides exactly its two steps, then stays put on the wall's foot
    g.cellState[9 * 30 + 15] = 2;
    g.markDirty(0, 0, 29, 19);
    while (g.settling && t < 400) settleStep(g, loose, t++, 1e9);
    expect(g.get(15, 9)).toBe(0);
    expect(g.get(16, 18)).toBe(1);
    expect(g.cellState[18 * 30 + 16]).toBe(1);
  });

  it('a fall material without a repose still stands sheer', () => {
    const g = new Grid(20, 20);
    for (let x = 0; x < 20; x++) g.set(x, 19, 3);
    for (let y = 9; y < 19; y++) for (let x = 8; x < 12; x++) g.set(x, y, 1);
    g.markDirty(0, 0, 19, 19);
    run(g);
    for (let y = 9; y < 19; y++) for (let x = 8; x < 12; x++) expect(g.get(x, y)).toBe(1);
    expect(g.get(7, 18)).toBe(0);
  });

  it('sand that slides over dirt churns into it instead of lying on top as a clean layer', () => {
    const W = 60;
    const H = 40;
    const g = new Grid(W, H);
    for (let x = 0; x < W; x++) g.set(x, H - 1, 3);
    // a 45 degree dirt ramp with a tall column of sand dropped at its top
    for (let x = 0; x < 30; x++) for (let y = 8 + x; y < H - 1; y++) g.set(x, y, 1);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) g.set(x, y, 2);
    g.markDirty(0, 0, W - 1, H - 1);
    let dirt0 = 0;
    for (let i = 0; i < g.size; i++) if (g.material[i] === 1) dirt0++;
    run(g, 2000);
    expect(g.settling).toBe(false);
    let dirt = 0;
    let sand = 0;
    let buried = 0;
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const m = g.get(x, y);
        if (m === 1) dirt++;
        if (m === 2) {
          sand++;
          if (g.get(x, y - 1) === 1) buried++;
        }
      }
    }
    // nothing lost, and some sand grains now sit under dirt
    expect(dirt).toBe(dirt0);
    expect(sand).toBe(48);
    expect(buried).toBeGreaterThan(3);
  });

  it('sliding sand drags some of the dirt it runs over along, and the slide then dies out', () => {
    const drag = new MaterialTable([
      { ...mat('material.dirt', 1, 'fall'), repose: 1 },
      mat('material.sand', 2, 'slide'),
      mat('material.rock', 3, 'static'),
    ]);
    const W = 80;
    const H = 60;
    const g = new Grid(W, H);
    for (let x = 0; x < W; x++) g.set(x, H - 1, 3);
    // a firm dirt cliff, sheer on its right, with a thick bed of sand on top
    for (let x = 0; x < 30; x++) for (let y = 20; y < H - 1; y++) g.set(x, y, 1);
    for (let x = 0; x < 30; x++) for (let y = 8; y < 20; y++) g.set(x, y, 2);
    g.markDirty(0, 0, W - 1, H - 1);
    let t = 0;
    while (g.settling && t < 4000) settleStep(g, drag, t++, 1e9);
    expect(g.settling).toBe(false);
    // dirt was pulled off the cliff edge and lies out on the floor beyond it...
    let out = 0;
    for (let x = 30; x < W; x++) for (let y = 0; y < H - 1; y++) if (g.get(x, y) === 1) out++;
    expect(out).toBeGreaterThan(5);
    // ...but the cliff is still mostly a cliff: firm dirt is no sand
    let kept = 0;
    for (let x = 0; x < 30; x++) for (let y = 20; y < H - 1; y++) if (g.get(x, y) === 1) kept++;
    expect(kept).toBeGreaterThan(30 * 39 * 0.8);
  });

  it("carries each grain's cosmetic shade down with it", () => {
    const g = new Grid(8, 20);
    g.set(3, 2, 1);
    g.set(4, 2, 1);
    g.markDirty(3, 2, 4, 2);
    const a = grainShade(3, 2);
    const b = grainShade(4, 2);
    expect(a).toBeGreaterThan(0);
    run(g);
    expect(g.get(3, 19)).toBe(1);
    expect(g.shade[19 * 8 + 3]).toBe(a);
    expect(g.shade[19 * 8 + 4]).toBe(b);
  });

  it('drops a floating dirt cell with acceleration and stops on the floor', () => {
    const g = new Grid(5, 60);
    g.set(2, 0, 1);
    g.markDirty(2, 0, 2, 0);
    settleStep(g, mats, 0, 1e9);
    expect(g.get(2, 1)).toBe(1);
    settleStep(g, mats, 1, 1e9);
    expect(g.get(2, 3)).toBe(1);
    run(g);
    expect(g.get(2, 59)).toBe(1);
    expect(g.settling).toBe(false);
    expect(MAX_FALL_SPEED).toBeGreaterThan(1);
  });

  it('collapses a column into a gap and keeps rock in place', () => {
    const g = new Grid(5, 20);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 3; x++) g.set(x, y, 1);
    g.set(4, 5, 3);
    g.markDirty(0, 0, 4, 19);
    run(g);
    let n = 0;
    for (let y = 10; y < 20; y++) for (let x = 0; x < 3; x++) n += g.get(x, y) === 1 ? 1 : 0;
    expect(n).toBe(30);
    expect(g.get(4, 5)).toBe(3);
  });

  it('slides sand into a slope and topples one-cell dirt spires', () => {
    const g = new Grid(21, 21);
    for (let y = 0; y < 21; y++) g.set(10, y, 2);
    g.markDirty(0, 0, 20, 20);
    run(g);
    expect(g.surfaceY(10)).toBeGreaterThan(5);
    expect(g.surfaceY(8)).toBeLessThan(21);
    expect(g.surfaceY(12)).toBeLessThan(21);

    const h = new Grid(9, 10);
    for (let y = 2; y < 10; y++) h.set(4, y, 1);
    h.markDirty(0, 0, 8, 9);
    run(h);
    expect(h.surfaceY(4)).toBeGreaterThan(2);
  });

  it('spreads flow material sideways', () => {
    const g = new Grid(11, 3);
    for (let x = 0; x < 11; x++) g.set(x, 2, 3);
    g.set(5, 1, 4);
    g.set(5, 0, 4);
    g.markDirty(0, 0, 10, 2);
    run(g);
    let row0 = 0;
    let row1 = 0;
    for (let x = 0; x < 11; x++) {
      row0 += g.get(x, 0);
      row1 += g.get(x, 1) === 4 ? 1 : 0;
    }
    expect(row0).toBe(0);
    expect(row1).toBe(2);
  });

  it('caps cells moved per tick and continues later', () => {
    const g = new Grid(50, 40);
    for (let x = 0; x < 50; x++) g.set(x, 0, 1);
    g.markDirty(0, 0, 49, 0);
    expect(settleStep(g, mats, 0, 10)).toBe(10);
    expect(g.settling).toBe(true);
    run(g, 1000, 10);
    for (let x = 0; x < 50; x++) expect(g.get(x, 39)).toBe(1);
  });
});

describe('momentum (glide)', () => {
  const table = (glide: number): MaterialTable =>
    new MaterialTable([
      { ...mat('material.dirt', 1, 'fall'), repose: 1, ...(glide > 0 ? { glide } : {}) },
      mat('material.rock', 3, 'static'),
    ]);

  /** Drop a 12 × 12 block of dirt 60 cells onto a rock floor; returns the grid once it is still. */
  function drop(glide: number): { g: Grid; ticks: number } {
    const W = 120;
    const H = 100;
    const g = new Grid(W, H);
    const t = table(glide);
    const debris = new DebrisPool();
    for (let x = 0; x < W; x++) g.set(x, H - 1, 3);
    for (let y = 20; y < 32; y++) for (let x = 54; x < 66; x++) g.set(x, y, 1);
    g.markDirty(0, 0, W - 1, H - 1);
    let ticks = 0;
    while ((g.settling || debris.count > 0) && ticks < 2000) {
      debris.step(g, 8000, t);
      settleStep(g, t, ticks++, 1e9, debris);
    }
    return { g, ticks };
  }

  function shape(g: Grid): { cells: number; width: number; height: number } {
    let cells = 0;
    let x0 = g.width;
    let x1 = -1;
    let top = g.height;
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        if (g.get(x, y) !== 1) continue;
        cells++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < top) top = y;
      }
    }
    return { cells, width: x1 - x0 + 1, height: g.height - 1 - top };
  }

  it('without glide a dropped block lands as the block it fell as', () => {
    const { g } = drop(0);
    expect(shape(g)).toEqual({ cells: 144, width: 12, height: 12 });
  });

  it('with glide it lands hard and spreads into a lower, wider heap, losing nothing', () => {
    const { g, ticks } = drop(0.5);
    const s = shape(g);
    expect(ticks).toBeLessThan(600);
    expect(s.cells).toBe(144);
    expect(s.width).toBeGreaterThan(20);
    expect(s.height).toBeLessThan(12);
    // every grain is at rest and carries no leftover motion
    for (let i = 0; i < g.size; i++) if (g.material[i] === 1) expect(g.fallVel[i]).toBe(0);
  });

  it('is deterministic', () => {
    const a = drop(0.5).g;
    const b = drop(0.5).g;
    expect(Array.from(a.material)).toEqual(Array.from(b.material));
  });

  it('a short drop is not an impact: the block stays a block', () => {
    const W = 60;
    const H = 40;
    const g = new Grid(W, H);
    const t = table(0.5);
    for (let x = 0; x < W; x++) g.set(x, H - 1, 3);
    for (let y = H - 12; y < H - 4; y++) for (let x = 26; x < 34; x++) g.set(x, y, 1);
    g.markDirty(0, 0, W - 1, H - 1);
    let ticks = 0;
    while (g.settling && ticks < 300) settleStep(g, t, ticks++, 1e9, new DebrisPool());
    for (let y = H - 9; y < H - 1; y++) for (let x = 26; x < 34; x++) expect(g.get(x, y)).toBe(1);
  });
});

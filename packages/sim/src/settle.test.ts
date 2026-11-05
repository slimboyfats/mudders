import type { MaterialManifest } from '@mudders/shared';
import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
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

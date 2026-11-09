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

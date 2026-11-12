import type { MaterialManifest } from '@mudders/shared';
import { describe, expect, it } from 'vitest';
import { Chunker } from './chunks';
import { DebrisPool } from './debris';
import { FP } from './fixed';
import { Grid } from './grid';
import { KEEP, MaterialTable } from './materials';
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
const RUBBLE = 3;
const mats = new MaterialTable([
  mat('material.dirt', DIRT, 'fall'),
  mat('material.rock', ROCK, 'static', 8),
  mat('material.rubble', RUBBLE, 'fall'),
]);
const W = 200;
const H = 120;
const GRAVITY = Math.round(0.12 * FP);
const fx = { emit: () => undefined };

/** A dirt floor from row 100 and a rock shelf (rows 30..41) reaching from the left wall to `reach`. */
function shelf(reach: number): Grid {
  const g = new Grid(W, H);
  g.material.fill(DIRT, 100 * W);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 10; x++) g.material[y * W + x] = ROCK;
  for (let y = 30; y < 42; y++) for (let x = 10; x < reach; x++) g.material[y * W + x] = ROCK;
  g.markDirty(0, 0, W - 1, H - 1);
  return g;
}

function count(g: Grid, m: number, y0 = 0, y1 = H - 1): number {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (g.material[y * W + x] === m) n++;
  return n;
}

/** Let the shelf break and everything come to rest; returns ticks taken and the most pieces seen. */
function run(g: Grid, chunks: Chunker): { ticks: number; most: number } {
  const scratch = new Scratch(g.size);
  const debris = new DebrisPool();
  let most = 0;
  let t = 0;
  for (; t < 3000; t++) {
    debris.step(g, GRAVITY, mats);
    if (chunks.any) chunks.step(g, mats, GRAVITY, debris, fx);
    settleStep(g, mats, t, 1e9, debris);
    most = Math.max(most, chunks.count);
    if (debris.count > 0 || chunks.any || g.settling) continue;
    if (supportPass(g, mats, scratch, debris, fx, chunks) === 0) break;
  }
  return { ticks: t, most };
}

describe('falling pieces', () => {
  it('a shelf that hangs too far breaks off in pieces that land as rock below', () => {
    const g = shelf(90);
    const before = count(g, ROCK);
    const chunks = new Chunker();
    const { ticks, most } = run(g, chunks);
    expect(most).toBeGreaterThan(1);
    expect(ticks).toBeLessThan(1500);
    expect(chunks.any).toBe(false);
    // the far end of the shelf is gone, and its rock lies on the floor
    expect(g.material[35 * W + 85]).toBe(0);
    expect(count(g, ROCK, 60, 99)).toBeGreaterThan(300);
    // turning a piece on the grid may cost or add a few cells, never many
    const after = count(g, ROCK);
    expect(Math.abs(after - before)).toBeLessThan(before * 0.04);
  });

  it('pieces lie at an angle, not as the level slab they broke from', () => {
    const g = shelf(90);
    run(g, new Chunker());
    // rows of rock on the floor: a level 12-row slab would fill 12 rows only
    let rows = 0;
    for (let y = 43; y < 100; y++) {
      let any = false;
      for (let x = 12; x < W && !any; x++) any = g.material[y * W + x] === ROCK;
      if (any) rows++;
    }
    expect(rows).toBeGreaterThan(14);
  });

  it('is deterministic', () => {
    const a = shelf(90);
    const b = shelf(90);
    const ra = run(a, new Chunker());
    const rb = run(b, new Chunker());
    expect(ra.ticks).toBe(rb.ticks);
    expect(a.material).toEqual(b.material);
  });

  it('a shelf within its reach stays', () => {
    const g = shelf(16);
    const before = count(g, ROCK);
    const chunks = new Chunker();
    const { most } = run(g, chunks);
    expect(most).toBe(0);
    expect(count(g, ROCK)).toBe(before);
  });

  it('a piece of a broken prop that falls keeps its core and sheds a skin of rubble', () => {
    const g = new Grid(W, H);
    g.material.fill(DIRT, 100 * W);
    const list = new Int32Array(g.size);
    const mark = new Uint8Array(g.size);
    let n = 0;
    for (let y = 20; y < 34; y++) {
      for (let x = 90; x < 106; x++) {
        g.material[y * W + x] = ROCK;
        mark[y * W + x] = 1;
        list[n++] = y * W + x;
      }
    }
    const into = new Uint8Array(256).fill(KEEP);
    into[ROCK] = RUBBLE;
    const chunks = new Chunker();
    chunks.take(g, mats, list, n, mark, 1, null, into, -1);
    expect(chunks.any).toBe(true);
    expect(count(g, ROCK)).toBe(0);
    const debris = new DebrisPool();
    for (let t = 0; t < 2000 && (chunks.any || debris.count > 0 || g.settling); t++) {
      debris.step(g, GRAVITY, mats);
      if (chunks.any) chunks.step(g, mats, GRAVITY, debris, fx);
      settleStep(g, mats, t, 1e9, debris);
    }
    expect(chunks.any).toBe(false);
    // it fell, so it stays a rock with a skin of rubble, down on the floor
    const rock = count(g, ROCK);
    const rubble = count(g, RUBBLE);
    expect(rock).toBeGreaterThan(40);
    expect(rubble).toBeGreaterThan(40);
    expect(Math.abs(rock + rubble - n)).toBeLessThan(n * 0.08);
    expect(count(g, RUBBLE, 0, 60) + count(g, ROCK, 0, 60)).toBe(0);
  });
});

import type { QuadBatch } from './batch';
import type { FxRng } from './gl';

/**
 * Spark crawls (render-only): when a charge runs through a conductor (`sparkCrawl` events from
 * `terrainop.conduct`: a lightning strike on water or a steel frame), a single-cell spark runs
 * along the charged material itself, jinking from cell to cell, with a short stepped tail, and
 * leaves the cells it passed blinking in hard steps for a moment. Every lit cell is one whole map
 * cell: no glow, no smoothing.
 */
export interface SparkCrawl {
  /** Cells of the path the spark runs, x0,y0,x1,y1,… */
  cells: Int32Array;
  start: number;
  dur: number;
  seed: number;
}

/** Cells the head runs per tick. */
export const CRAWL_SPEED = 2;
/** Tail length in cells behind the head. */
export const CRAWL_TAIL = 5;
/** Ticks the trail keeps blinking after the head has run off its end. */
const CRAWL_LINGER = 14;
/** Hard colour steps, head first. */
const CRAWL_STEPS = [0xffffff, 0xd8f0ff, 0x9ad8ff, 0x9ad8ff, 0x5080e0, 0x5080e0] as const;

/** 4-neighbour steps: left, right, up, down. */
const DX = [-1, 1, 0, 0] as const;
const DY = [0, 0, -1, 1] as const;

/**
 * A jagged path of up to `len` cells from (x, y) through cells whose material is `mat`, only
 * through 4-joined cells (the way the charge itself runs). It keeps to a heading for a few cells,
 * then jinks, never steps back onto the cells it just left, and stops at a dead end.
 */
export function crawlPath(
  material: (x: number, y: number) => number,
  width: number,
  height: number,
  x: number,
  y: number,
  mat: number,
  len: number,
  rng: FxRng,
): Int32Array {
  const pts: number[] = [];
  if (x < 0 || y < 0 || x >= width || y >= height || material(x, y) !== mat)
    return new Int32Array(0);
  pts.push(x, y);
  let dir = Math.floor(rng.next() * 4);
  for (let n = 1; n < len; n++) {
    // keep the heading most of the time, jink otherwise; try the rest in a shuffled order
    const first = rng.next() < 0.6 ? dir : Math.floor(rng.next() * 4);
    const turn = rng.next() < 0.5 ? 1 : 3;
    let moved = false;
    for (let k = 0; k < 4 && !moved; k++) {
      const d = (first + k * turn) & 3;
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || material(nx, ny) !== mat) continue;
      // not back onto the last few cells
      let back = false;
      for (let j = Math.max(0, pts.length - 12); j < pts.length; j += 2) {
        if (pts[j] === nx && pts[j + 1] === ny) {
          back = true;
          break;
        }
      }
      if (back) continue;
      x = nx;
      y = ny;
      dir = d;
      pts.push(x, y);
      moved = true;
    }
    if (!moved) break;
  }
  return Int32Array.from(pts);
}

/** How long a crawl along `cells` lives, in ticks. */
export function crawlLife(cells: Int32Array): number {
  return Math.ceil(cells.length / 2 / CRAWL_SPEED) + CRAWL_TAIL + CRAWL_LINGER;
}

/** Draw every live crawl at tick `t` (additive, one whole cell per lit cell). */
export function drawCrawls(additive: QuadBatch, crawls: readonly SparkCrawl[], t: number): void {
  for (const s of crawls) {
    const age = t - s.start;
    if (age < 0 || age > s.dur) continue;
    // a dark tick now and then: the spark stutters
    const tickHash = (Math.imul(age + 1, 374761393) ^ (s.seed | 0)) >>> 0;
    if ((tickHash & 7) === 0) continue;
    const c = s.cells;
    const n = c.length >> 1;
    const head = age * CRAWL_SPEED;
    for (let k = 0; k <= CRAWL_TAIL; k++) {
      const i = head - k;
      if (i < 0 || i >= n) continue;
      const col = CRAWL_STEPS[k]!;
      additive.push(c[i * 2]! + 0.5, c[i * 2 + 1]! + 0.5, 1, 1, col, k === 0 ? 1 : 0.85);
    }
    // the trail it passed blinks, fewer cells as it fades
    const passed = Math.min(n, head - CRAWL_TAIL);
    const left = 1 - Math.max(0, age - n / CRAWL_SPEED) / (CRAWL_TAIL + CRAWL_LINGER);
    const keep = left > 0.66 ? 5 : left > 0.33 ? 3 : 1;
    for (let i = 0; i < passed; i++) {
      const h =
        (Math.imul(i + 1, 2246822519) ^ Math.imul(age + 1, 3266489917) ^ (s.seed | 0)) >>> 0;
      if (((h >>> 9) & 15) >= keep) continue;
      additive.push(c[i * 2]! + 0.5, c[i * 2 + 1]! + 0.5, 1, 1, 0x5080e0, 0.7);
    }
  }
}

import type { Grid } from './grid';
import type { MaterialTable } from './materials';

/**
 * Preallocated buffers for flood fills and bulk ops (§9): an `Int32Array` queue and generation-
 * stamped `Uint8Array` masks, so nothing allocates per cell. Contents are transient within a call
 * and never part of the sim state.
 */
export class Scratch {
  readonly queue: Int32Array;
  readonly mark: Uint8Array;
  readonly moved: Uint8Array;
  readonly tmpMat: Uint8Array;
  readonly tmpCoat: Uint8Array;
  readonly tmpState: Uint8Array;
  private markGen = 0;
  private movedGen = 0;

  constructor(readonly size: number) {
    this.queue = new Int32Array(size);
    this.mark = new Uint8Array(size);
    this.moved = new Uint8Array(size);
    this.tmpMat = new Uint8Array(size);
    this.tmpCoat = new Uint8Array(size);
    this.tmpState = new Uint8Array(size);
  }

  /** New stamp for `mark`. A cell is marked iff `mark[i] === gen`. */
  nextMarkGen(): number {
    if (this.markGen === 255) {
      this.mark.fill(0);
      this.markGen = 0;
    }
    return ++this.markGen;
  }

  nextMovedGen(): number {
    if (this.movedGen === 255) {
      this.moved.fill(0);
      this.movedGen = 0;
    }
    return ++this.movedGen;
  }
}

/** True if the cell's material or coating binds (cohesion > 0). */
export function isCohesive(grid: Grid, mats: MaterialTable, idx: number): boolean {
  return mats.cohesion[grid.material[idx]!]! > 0 || mats.cohesion[grid.coating[idx]!]! > 0;
}

/**
 * Flood-fill the 4-connected cohesive component containing `start`, restricted to the disc
 * (cx, cy, r) and capped at `max` cells. Component indices land in `scratch.queue[0..n)` and are
 * stamped with `gen` in `scratch.mark`. Returns n, or -1 if the cap was hit.
 */
export function floodCohesive(
  grid: Grid,
  mats: MaterialTable,
  scratch: Scratch,
  start: number,
  cx: number,
  cy: number,
  r: number,
  gen: number,
  max: number,
): number {
  const W = grid.width;
  const H = grid.height;
  const q = scratch.queue;
  const mark = scratch.mark;
  const mat = grid.material;
  const coat = grid.coating;
  const coh = mats.cohesion;
  const r2 = r * r;
  let head = 0;
  let tail = 0;
  q[tail++] = start;
  mark[start] = gen;
  while (head < tail) {
    const i = q[head++]!;
    const x = i % W;
    const y = (i - x) / W;
    for (let n = 0; n < 4; n++) {
      const nx = n === 0 ? x - 1 : n === 1 ? x + 1 : x;
      const ny = n === 2 ? y - 1 : n === 3 ? y + 1 : y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (mark[j] === gen) continue;
      const m = mat[j]!;
      if (m === 0 || grid.group[j] !== 0) continue;
      if (coh[m]! <= 0 && coh[coat[j]!]! <= 0) continue;
      const dx = nx - cx;
      const dy = ny - cy;
      if (dx * dx + dy * dy >= r2) continue;
      if (tail >= max) return -1;
      mark[j] = gen;
      q[tail++] = j;
    }
  }
  return tail;
}

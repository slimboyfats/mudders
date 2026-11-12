import { FP } from '@mudders/shared';
import type { EffectSink } from './behaviours';
import type { Chunker } from './chunks';
import type { DebrisPool } from './debris';
import type { Grid } from './grid';
import { SETTLE_STATIC, type MaterialTable } from './materials';
import type { Scratch } from './scratch';

/** Furthest any cell can hang from what holds it, whatever its material. */
export const MAX_REACH = 72;
/** Overhang thickness (rows) at which a material gets exactly its `span` of reach. */
const SPAN_THICKNESS = 8;
/** Thickness beyond which a thicker shelf reaches no further. */
const MAX_THICKNESS = 32;

/** Cells released per material in the current pass (transient scratch). */
const perMaterial = new Int32Array(256);

/** Order-free hash: how ragged the break line is per row. */
function jag(y: number, x: number): number {
  let h = Math.imul((y * 0x9e37) ^ (x >> 5) ^ 0x3c6ef372, 0x85ebca6b);
  h ^= h >>> 13;
  return (Math.imul(h, 0xc2b2ae35) >>> 24) % 3;
}

/**
 * Structure of the terrain itself (§4b): what holds an overhang up. Run once the grid has gone
 * still after something changed. Within the changed box (plus what could hang from it):
 *
 * - a cell is *grounded* when it stands on a stack of solid cells that reaches the floor, when it
 *   belongs to a prop group (those have their own structure, §4c), or when it is static with no
 *   `span` (floatstone, slag: these hold on their own);
 * - every other solid cell hangs: its *distance* is the shortest path through solid cells to a
 *   grounded one, and its *thickness* the rows of the hanging run it is in;
 * - a static cell with a `span` whose distance is further than its reach comes loose: the reach
 *   is `span` at 8 rows of thickness, growing with the thickness up to 32 rows, and never more
 *   than 3 × `span`. Loose cells break off along a ragged line and fall as debris of their own
 *   material, landing as terrain again (a rock shelf drops as rock, in a heap).
 *
 * `fall`/`slide`/`flow` materials never hang when the grid is still, so they are only ever
 * supports here. Everything is typed arrays over the scratch buffers; nothing allocates.
 * Returns the number of cells released.
 */
/** Does cell i hang too far for its material (see `supportPass`)? */
function loose(
  mats: MaterialTable,
  mat: Uint8Array,
  grounded: Uint8Array,
  thick: Uint8Array,
  dist: Uint8Array,
  i: number,
  x: number,
  y: number,
): boolean {
  const m = mat[i]!;
  if (m === 0 || grounded[i] !== 0 || mats.settle[m] !== SETTLE_STATIC) return false;
  const span = mats.span[m]!;
  if (span === 255) return false;
  const t = Math.min(MAX_THICKNESS, thick[i]!);
  const reach = Math.min(3 * span, Math.max(1, Math.trunc((span * t) / SPAN_THICKNESS)));
  // the break line wanders a cell either way from row to row
  return dist[i]! > reach + jag(y, x) - 1;
}

export function supportPass(
  grid: Grid,
  mats: MaterialTable,
  scratch: Scratch,
  debris: DebrisPool,
  fx: EffectSink,
  chunks?: Chunker,
): number {
  if (grid.structMaxX < grid.structMinX) return 0;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const group = grid.group;
  const spanOf = mats.span;
  const settle = mats.settle;
  // cells that may be released, and the wider box their support may lie in
  const cx0 = Math.max(0, grid.structMinX - MAX_REACH);
  const cx1 = Math.min(W - 1, grid.structMaxX + MAX_REACH);
  const rx0 = Math.max(0, cx0 - MAX_REACH);
  const rx1 = Math.min(W - 1, cx1 + MAX_REACH);
  grid.clearStruct();

  const grounded = scratch.tmpCoat; // 1 = grounded (or a support in its own right)
  const dist = scratch.tmpMat; // path length to the nearest grounded cell, 255 = none found
  const thick = scratch.tmpState; // rows in this cell's hanging run
  const q = scratch.queue;
  let tail = 0;
  let hanging = 0;
  // one pass up each column: grounded or hanging, and the thickness of every hanging run
  for (let x = rx0; x <= rx1; x++) {
    let below = 1;
    let run = -1; // bottom row of the hanging run being climbed, or -1
    for (let y = H - 1, i = y * W + x; y >= -1; y--, i -= W) {
      const m = y < 0 ? 0 : mat[i]!;
      let g = 0;
      if (m === 0) {
        below = 0;
      } else {
        g =
          below !== 0 || group[i] !== 0 || (settle[m] === SETTLE_STATIC && spanOf[m] === 255)
            ? 1
            : 0;
        below = g;
        if (g === 0) {
          hanging++;
          dist[i] = 255;
          if (run < 0) run = y;
        }
      }
      if (y >= 0) grounded[i] = m === 0 ? 0 : g;
      if (run >= 0 && (m === 0 || g !== 0)) {
        const t = Math.min(255, run - y);
        for (let k = y + 1, kk = i + W; k <= run; k++, kk += W) thick[kk] = t;
        run = -1;
      }
    }
  }
  // nothing hangs (the usual case on soft ground): done after the one column pass
  if (hanging === 0) return 0;
  // grounded cells next to a hanging one seed the search
  const seeded = scratch.nextMarkGen();
  const mark = scratch.mark;
  for (let x = rx0; x <= rx1; x++) {
    for (let y = 0, i = x; y < H; y++, i += W) {
      if (mat[i] === 0 || grounded[i] !== 0) continue;
      for (let n = 0; n < 4; n++) {
        const nx = n === 0 ? x - 1 : n === 1 ? x + 1 : x;
        const ny = n === 2 ? y - 1 : n === 3 ? y + 1 : y;
        if (nx < rx0 || nx > rx1 || ny < 0 || ny >= H) continue;
        const j = ny * W + nx;
        if (mat[j] === 0 || grounded[j] === 0 || mark[j] === seeded) continue;
        mark[j] = seeded;
        dist[j] = 0;
        q[tail++] = j;
      }
    }
  }
  // breadth-first through hanging cells, out to MAX_REACH
  let head = 0;
  while (head < tail) {
    const i = q[head++]!;
    const d = dist[i]! + 1;
    if (d > MAX_REACH) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let n = 0; n < 4; n++) {
      const nx = n === 0 ? x - 1 : n === 1 ? x + 1 : x;
      const ny = n === 2 ? y - 1 : n === 3 ? y + 1 : y;
      if (nx < rx0 || nx > rx1 || ny < 0 || ny >= H) continue;
      const j = ny * W + nx;
      if (mat[j] === 0 || grounded[j] !== 0 || dist[j]! <= d) continue;
      dist[j] = d;
      q[tail++] = j;
    }
  }
  // release what hangs too far for its material
  let lost = 0;
  perMaterial.fill(0);
  let lx0 = W;
  let lx1 = -1;
  let ly0 = H;
  let ly1 = -1;
  const rel = scratch.nextMarkGen();
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = cx0, i = y * W + cx0; x <= cx1; x++, i++) {
      if (!loose(mats, mat, grounded, thick, dist, i, x, y)) continue;
      // resting on a hanging cell that holds: it would only land straight back where it is
      // (and be released again, forever), so it holds too
      if (
        y + 1 < H &&
        mat[i + W] !== 0 &&
        !loose(mats, mat, grounded, thick, dist, i + W, x, y + 1)
      ) {
        continue;
      }
      mark[i] = rel;
      q[n++] = i;
      perMaterial[mat[i]!] = perMaterial[mat[i]!]! + 1;
      if (x < lx0) lx0 = x;
      if (x > lx1) lx1 = x;
      if (y < ly0) ly0 = y;
      if (y > ly1) ly1 = y;
    }
  }
  // what can fall in one piece does (live play only); the rest drops as loose cells
  if (chunks) chunks.take(grid, mats, q, n, mark, rel, dist, null, -1);
  for (let k = 0; k < n; k++) {
    const i = q[k]!;
    const m = mat[i]!;
    if (m === 0) {
      lost++;
      continue;
    }
    const x = i % W;
    if (
      !debris.spawn(
        x * FP + FP / 2,
        ((i - x) / W) * FP + FP / 2,
        0,
        0,
        m,
        grid.coating[i]!,
        grid.cellState[i]!,
        grid.shadeOf(i),
      )
    )
      continue;
    grid.clearCell(i);
    lost++;
  }
  if (lost === 0) return 0;
  grid.markDirty(lx0, ly0, lx1, ly1);
  let material = 0;
  for (let m = 1; m < 256; m++) if (perMaterial[m]! > perMaterial[material]!) material = m;
  fx.emit('collapse', (lx0 + lx1) >> 1, (ly0 + ly1) >> 1, Math.max(lx1 - lx0, ly1 - ly0) >> 1, {
    cells: lost,
    terrain: 1,
    material,
  });
  return lost;
}

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

/**
 * Per column while climbing: is the cell below grounded, the bottom row of the open run, and
 * whether a run is open at all (for a look at four columns at once).
 */
let colBelow = new Uint8Array(0);
let colRun = new Int16Array(0);
let colOpen = new Uint8Array(0);
let colBelow32 = new Uint32Array(0);
let colOpen32 = new Uint32Array(0);

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

  // Nothing hangs (the usual case on soft ground) unless some solid cell that neither holds on
  // its own nor belongs to a group has air right under it: the lowest hanging cell of a column
  // is such a cell. One cheap look for that first; without one there is nothing to work out.
  let any = false;
  // (four cells a look where rows start on a word: air, or cells all standing on something,
  // cannot hold one)
  const mat32 =
    (W & 3) === 0 && mat.byteOffset === 0 ? new Uint32Array(mat.buffer, 0, mat.length >> 2) : null;
  look: for (let y = H - 2; y >= 0; y--) {
    for (let i = y * W + rx0, end = y * W + rx1; i <= end; i++) {
      if (mat32 !== null && (i & 3) === 0 && i + 3 <= end) {
        const below = mat32[(i + W) >> 2]!;
        if (mat32[i >> 2] === 0 || ((below - 0x01010101) & ~below & 0x80808080) === 0) {
          i += 3;
          continue;
        }
      }
      const m = mat[i]!;
      if (m === 0 || mat[i + W] !== 0 || group[i] !== 0) continue;
      if (settle[m] === SETTLE_STATIC && spanOf[m] === 255) continue;
      any = true;
      break look;
    }
  }
  if (!any) return 0;

  const grounded = scratch.tmpCoat; // 1 = grounded (or a support in its own right)
  const dist = scratch.tmpMat; // path length to the nearest grounded cell, 255 = none found
  const thick = scratch.tmpState; // rows in this cell's hanging run
  const q = scratch.queue;
  let tail = 0;
  let hanging = 0;
  // one pass up every column: grounded or hanging, and the thickness of every hanging run. The
  // columns climb together, a row at a time, so the layers are read in memory order (a column at a
  // time touched a new cache line per cell, and this pass runs after every change to the ground).
  if (colBelow.length < W) {
    const n = (W + 3) & ~3;
    colBelow = new Uint8Array(n);
    colRun = new Int16Array(n);
    colOpen = new Uint8Array(n);
    colBelow32 = new Uint32Array(colBelow.buffer);
    colOpen32 = new Uint32Array(colOpen.buffer);
  }
  const colB = colBelow;
  const colR = colRun;
  const colO = colOpen;
  // Four columns a look where the map allows it (rows start on a word). Solid ground standing
  // on grounded cells, and air over air with no run open, are nearly all of a map: the first
  // is grounded as a whole, the second changes nothing.
  const grounded32 =
    mat32 !== null && grounded.byteOffset === 0
      ? new Uint32Array(grounded.buffer, 0, mat.length >> 2)
      : null;
  const colB32 = colBelow32;
  const colO32 = colOpen32;
  // the box the hanging cells lie in: all the later passes have to look at
  let hx0 = W;
  let hx1 = -1;
  let hy0 = H;
  let hy1 = -1;
  colB.fill(1, rx0, rx1 + 1);
  colR.fill(-1, rx0, rx1 + 1);
  colO.fill(0, rx0, rx1 + 1);
  // a row of air over a row of air (the sky over the land) changes nothing: every run is closed
  // and nothing in it is ever read back
  let wasAir = false;
  for (let y = H - 1; y >= -1; y--) {
    if (y >= 0) {
      let p = y * W + rx0;
      const end = y * W + rx1;
      while (p <= end && mat[p] === 0) {
        if (mat32 !== null && (p & 3) === 0 && p + 3 <= end && mat32[p >> 2] === 0) p += 4;
        else p++;
      }
      const air = p > end;
      if (air && wasAir) continue;
      wasAir = air;
    }
    for (let x = rx0, i = y * W + rx0; x <= rx1; x++, i++) {
      if (mat32 !== null && grounded32 !== null && y >= 0 && (x & 3) === 0 && x + 3 <= rx1) {
        const mw = mat32[i >> 2]!;
        const bw = colB32[x >> 2]!;
        if (bw === 0x01010101 && ((mw - 0x01010101) & ~mw & 0x80808080) === 0) {
          // four solid cells on grounded ones (no run can be open over a grounded cell)
          grounded32[i >> 2] = 0x01010101;
          x += 3;
          i += 3;
          continue;
        }
        if (mw === 0 && bw === 0 && colO32[x >> 2] === 0) {
          // air over air, no run to close; `grounded` is never read for an air cell
          x += 3;
          i += 3;
          continue;
        }
      }
      const m = y < 0 ? 0 : mat[i]!;
      let g = 0;
      if (m === 0) {
        colB[x] = 0;
      } else {
        g =
          colB[x] !== 0 || group[i] !== 0 || (settle[m] === SETTLE_STATIC && spanOf[m] === 255)
            ? 1
            : 0;
        colB[x] = g;
        if (g === 0) {
          hanging++;
          dist[i] = 255;
          if (colR[x]! < 0) {
            colR[x] = y;
            colO[x] = 1;
          }
          if (x < hx0) hx0 = x;
          if (x > hx1) hx1 = x;
          if (y < hy0) hy0 = y;
          if (y > hy1) hy1 = y;
        }
      }
      if (y >= 0) grounded[i] = g;
      const run = colR[x]!;
      if (run >= 0 && (m === 0 || g !== 0)) {
        const t = Math.min(255, run - y);
        for (let k = y + 1, kk = i + W; k <= run; k++, kk += W) thick[kk] = t;
        colR[x] = -1;
        colO[x] = 0;
      }
    }
  }
  if (hanging === 0) return 0;
  // grounded cells next to a hanging one seed the search
  const seeded = scratch.nextMarkGen();
  const mark = scratch.mark;
  for (let y = hy0; y <= hy1; y++) {
    for (let x = hx0, i = y * W + hx0; x <= hx1; x++, i++) {
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
  // from the bottom row up, so each cell knows whether the one under it is going
  const ex0 = Math.max(cx0, hx0);
  const ex1 = Math.min(cx1, hx1);
  for (let y = hy1; y >= hy0; y--) {
    for (let x = ex1, i = y * W + ex1; x >= ex0; x--, i--) {
      if (!loose(mats, mat, grounded, thick, dist, i, x, y)) continue;
      // resting on a cell that stays: it would only land straight back where it is (and be
      // released again, forever), so it holds too
      if (y + 1 < H && mat[i + W] !== 0 && mark[i + W] !== rel) continue;
      mark[i] = rel;
      q[n++] = i;
      perMaterial[mat[i]!] = perMaterial[mat[i]!]! + 1;
      if (x < lx0) lx0 = x;
      if (x > lx1) lx1 = x;
      if (y < ly0) ly0 = y;
      if (y > ly1) ly1 = y;
    }
  }
  // top row first, as the piece taker and the debris pool expect
  for (let a = 0, b = n - 1; a < b; a++, b--) {
    const t = q[a]!;
    q[a] = q[b]!;
    q[b] = t;
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

import type { Grid } from './grid';
import {
  AGE_MASK,
  SETTLE_FALL,
  SETTLE_FLOW,
  SETTLE_SLIDE,
  SETTLE_STATIC,
  type MaterialTable,
} from './materials';

/** Terminal fall speed in cells per tick. */
export const MAX_FALL_SPEED = 8;
/** How far a resting liquid looks sideways for a drop to run to. */
const DROP_LOOK = 32;

/**
 * One settle step (§4.3) over the grid's settle region only. Unsupported `fall`/`slide`/`flow`
 * cells accelerate downward (1 cell/tick² up to MAX_FALL_SPEED), `slide` cells also move one cell
 * diagonally when blocked, `flow` cells sideways. A `fall` cell with air on both sides (the top of a
 * one-cell spire) topples diagonally, so debris doesn't leave needles standing. Scans bottom-up so a moved cell is never moved
 * twice in a tick. At most `maxCells` cells move per tick; the rest continue next tick.
 *
 * Returns the number of cells moved. Shrinks the settle region to what may still move.
 */
export function settleStep(
  grid: Grid,
  mats: MaterialTable,
  tick: number,
  maxCells: number,
): number {
  if (!grid.settling) return 0;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const coat = grid.coating;
  const gas = grid.gas;
  const state = grid.cellState;
  const vel = grid.fallVel;
  const group = grid.group;
  const shade = grid.shade;
  const kind = mats.settle;
  const density = mats.density;
  const spread = mats.spread;
  const disperse = mats.disperse;
  const act = mats.active;
  const turns = mats.decayTurns;
  const x0 = grid.settleMinX;
  const x1 = grid.settleMaxX;
  const span = x1 - x0;
  let nMinX = W;
  let nMaxX = -1;
  let nMaxY = -1;
  let nMinY = H;
  let moved = 0;
  let capped = false;
  const ltr = (tick & 1) === 0;

  rows: for (let y = Math.min(grid.settleMaxY, H - 2); y >= 0; y--) {
    const row = y * W;
    for (let i = 0; i <= span; i++) {
      const x = ltr ? x0 + i : x1 - i;
      const idx = row + x;
      const m = mat[idx]!;
      if (m === 0) continue;
      const k = kind[m]!;
      // intact prop groups hold their cells in place whatever the material (§4c)
      if (k === SETTLE_STATIC || group[idx] !== 0) continue;
      const below = idx + W;
      let dst = -1;
      let dy = 0;
      const mb = mat[below]!;
      if (mb !== 0 && kind[mb] === SETTLE_FLOW && density[mb]! < density[m]!) {
        // heavier cells sink through lighter liquids: swap with the cell below
        mat[idx] = mb;
        mat[below] = m;
        const cs = coat[idx]!;
        coat[idx] = coat[below]!;
        coat[below] = cs;
        const ss = state[idx]!;
        state[idx] = state[below]!;
        state[below] = ss;
        const sh = grid.shadeOf(idx);
        shade[idx] = grid.shadeOf(below);
        shade[below] = sh;
        vel[idx] = 0;
        vel[below] = 1;
        grid.extendReact(x - 1, y - 1, x + 1, y + 2);
        if (x < nMinX) nMinX = x;
        if (x > nMaxX) nMaxX = x;
        if (y + 1 > nMaxY) nMaxY = y + 1;
        if (y < nMinY) nMinY = y;
        if (++moved >= maxCells) {
          capped = true;
          break rows;
        }
        continue;
      }
      if (mb === 0) {
        const v = Math.min(vel[idx]! + 1, MAX_FALL_SPEED);
        dst = below;
        dy = 1;
        while (dy < v && y + dy < H - 1 && mat[dst + W] === 0) {
          dst += W;
          dy++;
        }
        vel[dst] = v;
      } else if (k === SETTLE_FALL) {
        // A one-cell-wide spire topples: no side support at all, so it slides like sand.
        if (x > 0 && x < W - 1 && mat[idx - 1] === 0 && mat[idx + 1] === 0) {
          const d = ((x * 7 + y * 13 + tick) & 2) === 0 ? 1 : -1;
          if (mat[below + d] === 0) dst = below + d;
          else if (mat[below - d] === 0) dst = below - d;
          if (dst >= 0) {
            dy = 1;
            vel[dst] = 1;
          }
        }
      } else if (k >= SETTLE_SLIDE) {
        const dir = ((x * 7 + y * 13 + tick) & 2) === 0 ? 1 : -1;
        for (let s = 0; s < 2 && dst < 0; s++) {
          const d = s === 0 ? dir : -dir;
          const nx = x + d;
          if (nx < 0 || nx >= W) continue;
          if (mat[idx + d] === 0 && mat[below + d] === 0) {
            dst = below + d;
            dy = 1;
          } else if (
            k === SETTLE_FLOW &&
            mat[idx + d] === 0 &&
            (spread[m] === 0 ||
              (state[idx]! & AGE_MASK) < spread[m]! ||
              dropAhead(mat, idx, d, nx, W))
          ) {
            dst = idx + d;
            // a runny liquid keeps running along the surface, up to `disperse` cells, and stops
            // over a drop so it falls from there next tick
            for (let r = 1, nx2 = nx + d; r < disperse[m]!; r++, nx2 += d) {
              if (nx2 < 0 || nx2 >= W || mat[dst + d] !== 0 || mat[dst + W] === 0) break;
              dst += d;
            }
          }
        }
        if (dst >= 0) vel[dst] = 1;
      }
      vel[idx] = 0;
      if (dst < 0) continue;
      mat[dst] = m;
      mat[idx] = 0;
      coat[dst] = coat[idx]!;
      coat[idx] = 0;
      // falling into gas pushes the gas up into the cell it left (bubbles rise through water)
      if (gas[dst] !== 0) {
        gas[idx] = gas[dst]!;
        gas[dst] = 0;
        grid.extendGas(x, y);
      }
      shade[dst] = grid.shadeOf(idx);
      // moved reactive cells (lava, napalm, burning things) must be re-checked where they land
      if (act[m] !== 0 || turns[m] !== 0 || act[coat[dst]!] !== 0) {
        const dx0 = dst % W;
        const dy0 = (dst - dx0) / W;
        grid.extendReact(Math.min(x, dx0) - 1, y - 1, Math.max(x, dx0) + 1, dy0 + 1);
      }
      // a spreading liquid that falls starts spreading afresh
      state[dst] = dy > 0 && spread[m] !== 0 ? state[idx]! & ~AGE_MASK : state[idx]!;
      state[idx] = 0;
      const dx = (dst % W) - x;
      // a liquid that moved may have opened a drop for still liquid further along its surface
      // (the end of a terrace), so the next pass looks that far to either side
      const pad = dx !== 0 && spread[m] !== 0 ? DROP_LOOK : 0;
      const lo = (dx < 0 ? x + dx : x) - pad;
      const hi = (dx > 0 ? x + dx : x) + pad;
      if (lo < nMinX) nMinX = lo;
      if (hi > nMaxX) nMaxX = hi;
      if (y + dy > nMaxY) nMaxY = y + dy;
      if (y < nMinY) nMinY = y;
      if (++moved >= maxCells) {
        capped = true;
        break rows;
      }
    }
  }

  if (capped) {
    // Keep the old region and grow it by what moved; the rest continues next tick.
    grid.extendSettle(nMinX - 1, nMaxX + 1, nMaxY + 1);
  } else {
    grid.clearSettle();
    if (moved > 0) grid.extendSettle(nMinX - 1, nMaxX + 1, nMaxY + 1);
  }
  if (moved > 0) {
    grid.addRenderRect(nMinX, nMinY, nMaxX - nMinX + 1, nMaxY - nMinY + 1);
    grid.extendStruct(nMinX, nMinY, nMaxX, nMaxY);
  }
  return moved;
}

/**
 * Whether a liquid at `idx` running sideways in direction `d` reaches a drop (air below the row)
 * within DROP_LOOK cells before anything blocks it. A liquid whose spreading time is up still runs
 * towards a drop, so a lake whose side is blasted open pours into the hole instead of standing
 * as a slope, while a flat film or a ripple on a level lake stays put and the world goes quiet.
 */
function dropAhead(mat: Uint8Array, idx: number, d: number, nx: number, W: number): boolean {
  for (let r = 0, p = idx + d, x = nx; r < DROP_LOOK; r++, p += d, x += d) {
    if (x < 0 || x >= W || mat[p] !== 0) return false;
    if (mat[p + W] === 0) return true;
  }
  return false;
}

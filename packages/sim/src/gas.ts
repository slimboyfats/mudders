import type { Grid } from './grid';
import { ACT_REACT, KEEP, SETTLE_FLOW, type MaterialTable } from './materials';
import { place, react, roll, SRC_GAS } from './reactions';

/**
 * One gas pass over the grid's gas region (§4b). Gas cells live in `grid.gas`, only over air:
 * each tick a cell may end (its `decay` is a mean lifetime), react with what it touches (marsh
 * gas catching fire, flames lighting wood), then step up (or down, for heavy gas), diagonally
 * when blocked, or sideways with its drift, leaning with the wind. Rising gas is walked top-down
 * and sinking gas bottom-up, so a cell moves at most one step per tick. Gas that terrain falls
 * into is pushed up out of the way, or lost. Randomness is the reactions' cell hash, so there are
 * no PRNG draws and pass order never shifts other rolls.
 *
 * Gas never holds a turn: `World.quiet` ignores it, and it keeps drifting while the next player
 * aims. What it changes in the terrain (a flame lighting wood) marks those cells dirty as usual.
 */
export function gasStep(grid: Grid, mats: MaterialTable, tick: number, wind: number): void {
  if (!grid.gassy) return;
  const x0 = grid.gasMinX;
  const x1 = grid.gasMaxX;
  const y0 = grid.gasMinY;
  const y1 = grid.gasMaxY;
  grid.gasMaxX = -1;
  grid.gasMinX = 0;
  let sinkers = false;
  for (let y = y0; y <= y1; y++) if (pass(grid, mats, tick, wind, y, x0, x1, 1)) sinkers = true;
  if (sinkers) for (let y = y1; y >= y0; y--) pass(grid, mats, tick, wind, y, x0, x1, -1);
}

/** One row of the pass for gas with lift `lift`; returns whether it saw gas of the other kind. */
function pass(
  grid: Grid,
  mats: MaterialTable,
  tick: number,
  wind: number,
  y: number,
  x0: number,
  x1: number,
  lift: number,
): boolean {
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const gas = grid.gas;
  const ltr = (tick & 1) === 0;
  const span = x1 - x0;
  let other = false;
  for (let k = 0; k <= span; k++) {
    const x = ltr ? x0 + k : x1 - k;
    const i = y * W + x;
    const g = gas[i]!;
    if (g === 0) continue;
    const L = mats.gasLift[g]!;
    if (L !== lift) {
      if (L !== 0) other = true;
      if (lift === 1) grid.extendGas(x, y);
      continue;
    }
    // terrain moved into it: squeeze up (or down) out of the way, else it is lost
    if (mat[i] !== 0) {
      gas[i] = 0;
      const ny = y - lift;
      if (ny >= 0 && ny < H) {
        for (let d = 0; d < 3; d++) {
          const nx = d === 0 ? x : d === 1 ? x - 1 : x + 1;
          if (nx < 0 || nx >= W) continue;
          const j = ny * W + nx;
          if (mat[j] === 0 && gas[j] === 0) {
            gas[j] = g;
            grid.extendGas(nx, ny);
            break;
          }
        }
      }
      continue;
    }
    // lifetime: ends with chance 1/ticks per tick (and may go off as it does)
    const life = mats.decayTicks[g]!;
    if (life !== 0 && roll(i, tick, 13) * life < 65536) {
      const burst = mats.detonateChance[g]!;
      if (burst !== 0 && grid.burstCount < grid.bursts.length && roll(i, tick, 7) < burst) {
        grid.bursts[grid.burstCount++] = i;
        grid.bursts[grid.burstCount++] = g;
      }
      const into = mats.decayInto[g]!;
      gas[i] = 0;
      if (into !== 0 && into !== KEEP) {
        place(grid, mats, i, into);
        if (mats.gasLift[into] === 0) grid.markDirty(x, y, x, y);
      }
      continue;
    }
    if (mats.active[g]! & ACT_REACT) {
      react(grid, mats, i, g, SRC_GAS, tick);
      if (gas[i] !== g) {
        if (gas[i] !== 0) grid.extendGas(x, y);
        continue;
      }
    }
    // move: a sideways drift (leaning with the wind), else up, else diagonally up
    let dst = -1;
    let dx = 0;
    let dy = 0;
    const r = roll(i, tick, 17);
    const ny = y - lift;
    if (ny < 0 || ny >= H) {
      // rising off the top of the map (or sinking onto the floor and staying there)
      if (ny < 0) {
        gas[i] = 0;
        continue;
      }
    }
    if (r < mats.gasDrift[g]!) {
      // the wind wins three times in four; without wind, either way
      const coin = roll(i, tick, 19);
      const dir = wind !== 0 && (coin & 3) !== 0 ? (wind > 0 ? 1 : -1) : (coin & 16) !== 0 ? 1 : -1;
      const nx = x + dir;
      if (nx >= 0 && nx < W && mat[i + dir] === 0 && gas[i + dir] === 0) {
        dst = i + dir;
        dx = dir;
      }
    }
    if (dst < 0 && ny >= 0 && ny < H && roll(i, tick, 23) < mats.gasRise[g]!) {
      const up = i - lift * W;
      const mu = mat[up]!;
      if (mu === 0 && gas[up] === 0) {
        dst = up;
        dy = -lift;
      } else if (
        lift === 1 &&
        mu !== 0 &&
        mats.settle[mu] === SETTLE_FLOW &&
        grid.group[up] === 0
      ) {
        // a bubble: rising gas trades places with the liquid above it
        mat[i] = mu;
        grid.coating[i] = grid.coating[up]!;
        grid.cellState[i] = grid.cellState[up]!;
        mat[up] = 0;
        grid.coating[up] = 0;
        grid.cellState[up] = 0;
        gas[up] = g;
        gas[i] = 0;
        grid.markDirty(x, y - 1, x, y);
        grid.extendGas(x, y - 1);
        continue;
      } else {
        const d = (r & 64) !== 0 ? 1 : -1;
        for (let s = 0; s < 2 && dst < 0; s++) {
          const e = s === 0 ? d : -d;
          const nx = x + e;
          if (nx < 0 || nx >= W) continue;
          if (mat[up + e] === 0 && gas[up + e] === 0) {
            dst = up + e;
            dx = e;
            dy = -lift;
          }
        }
      }
    }
    if (dst < 0) {
      grid.extendGas(x, y);
      continue;
    }
    gas[dst] = g;
    gas[i] = 0;
    grid.extendGas(x + dx, y + dy);
    // a step along the row in the walking direction would be visited again: skip that cell
    if (dy === 0 && dx === (ltr ? 1 : -1)) k++;
  }
  return other;
}

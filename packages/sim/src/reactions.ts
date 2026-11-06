import type { Grid } from './grid';
import {
  ACT_BURST,
  ACT_DECAY,
  ACT_REACT,
  ACT_SPREAD,
  AGE_MASK,
  KEEP,
  MAX_REACTIONS,
  type MaterialTable,
} from './materials';

/** Order-free per-cell randomness for reactions: no RNG draws, identical on every engine. */
function roll(i: number, tick: number, k: number): number {
  // murmur3 finaliser over a mix of all three inputs, so neighbouring cells on the same tick
  // don't roll alike
  let h =
    (Math.imul(i, 0x9e3779b1) + Math.imul(tick, 0x85ebca77) + Math.imul(k + 1, 0xc2b2ae3d)) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h & 0xffff;
}

function setCell(grid: Grid, i: number, m: number): void {
  // a reaction (fire, quench) consumes a prop cell outright: it leaves its group
  grid.leaveGroup(i);
  grid.material[i] = m;
  grid.cellState[i] = 0;
  grid.fallVel[i] = 0;
  if (m === 0) grid.coating[i] = 0;
}

function dirty(grid: Grid, i: number): void {
  const x = i % grid.width;
  const y = (i - x) / grid.width;
  grid.markDirty(x, y, x, y);
}

/** Try the reactions of `src` (the cell's material, or its coating) against its neighbours. */
function react(
  grid: Grid,
  mats: MaterialTable,
  i: number,
  src: number,
  coating: boolean,
  tick: number,
): boolean {
  const W = grid.width;
  const mat = grid.material;
  const x = i % W;
  const y = (i - x) / W;
  for (let k = 0; k < MAX_REACTIONS; k++) {
    const r = src * MAX_REACTIONS + k;
    const chance = mats.reactChance[r]!;
    if (chance === 0) break;
    const w = mats.reactWith[r]!;
    // coatings creep along surfaces, so they also see diagonal neighbours (fire running along an
    // oiled slope sits diagonally above the next coated cell)
    for (let n = 0; n < (coating ? 8 : 4); n++) {
      const nx = n === 0 || n === 4 || n === 6 ? x - 1 : n === 1 || n === 5 || n === 7 ? x + 1 : x;
      const ny = n === 2 || n === 4 || n === 5 ? y - 1 : n === 3 || n === 6 || n === 7 ? y + 1 : y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= grid.height) continue;
      const j = ny * W + nx;
      // a coating's reaction also matches the neighbour's coating (burning oil spreading along oil)
      if (mat[j] !== w && !(coating && w !== 0 && grid.coating[j] === w)) continue;
      if (roll(i, tick, k) >= chance) return false;
      const into = mats.reactInto[r]!;
      const other = mats.reactOther[r]!;
      const spawn = mats.reactSpawn[r]!;
      if (into !== KEEP) {
        if (coating) grid.coating[i] = into;
        else setCell(grid, i, into);
      }
      if (other !== KEEP) {
        setCell(grid, j, other);
        dirty(grid, j);
      }
      if (spawn !== KEEP) {
        // into the first air neighbour, up first (flames rise)
        for (let s = 0; s < 4; s++) {
          const sx = s === 2 ? x - 1 : s === 3 ? x + 1 : x;
          const sy = s === 0 ? y - 1 : s === 1 ? y + 1 : y;
          if (sx < 0 || sy < 0 || sx >= W || sy >= grid.height) continue;
          const a = sy * W + sx;
          if (mat[a] !== 0) continue;
          setCell(grid, a, spawn);
          dirty(grid, a);
          break;
        }
      }
      dirty(grid, i);
      return true;
    }
  }
  return false;
}

/**
 * One reaction pass (§4b) over the grid's reaction region only: tick decays (fire burning out,
 * liquid dirt setting), spread ageing (flows stop spreading), adjacency reactions. The region
 * shrinks to cells that are still ticking plus whatever changed, so a quiet map costs nothing.
 * Cells with turn-based decay are noted in the turn region for `turnDecay`.
 */
export function reactStep(grid: Grid, mats: MaterialTable, tick: number): void {
  if (!grid.reacting) return;
  const W = grid.width;
  const x0 = grid.reactMinX;
  const x1 = grid.reactMaxX;
  const y0 = grid.reactMinY;
  const y1 = grid.reactMaxY;
  grid.clearReact();
  const mat = grid.material;
  const coat = grid.coating;
  const state = grid.cellState;
  const act = mats.active;
  const turns = mats.decayTurns;
  let aMinX = W;
  let aMaxX = -1;
  let aMinY = grid.height;
  let aMaxY = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
      const m = mat[i]!;
      const c = coat[i]!;
      const fm = act[m]!;
      const fc = act[c]!;
      if (m !== 0 && turns[m] !== 0) grid.extendTurn(x, y);
      if (fm === 0 && fc === 0) continue;
      let alive = false;
      if (fm & ACT_DECAY) {
        const s = state[i]! + 1;
        if (s >= mats.decayTicks[m]!) {
          setCell(grid, i, mats.decayInto[m]!);
          dirty(grid, i);
          continue;
        }
        state[i] = s;
        alive = true;
      } else if (fm & ACT_SPREAD) {
        const a = state[i]! & AGE_MASK;
        if (a < mats.spread[m]!) {
          state[i] = (state[i]! & ~AGE_MASK) | (a + 1);
          alive = true;
        }
      }
      if (fc & ACT_DECAY && c !== 0) {
        // coatings have no age byte of their own: they wear off with chance 1/ticks per tick
        if (roll(i, tick, 11) * mats.decayTicks[c]! < 65536) {
          coat[i] = mats.decayInto[c]!;
          dirty(grid, i);
        } else alive = true;
      }
      if (
        fm & ACT_BURST &&
        m !== 0 &&
        ((x > 0 && mat[i - 1] === 0) ||
          (x < W - 1 && mat[i + 1] === 0) ||
          (y > 0 && mat[i - W] === 0) ||
          (y < grid.height - 1 && mat[i + W] === 0))
      ) {
        // a buried pocket that has just been uncovered: the world sets it off after this pass
        // (queue full: stay in the region and try again next tick)
        if (grid.burstCount < grid.bursts.length) grid.bursts[grid.burstCount++] = i;
        else alive = true;
      }
      if (fm & ACT_REACT && m !== 0) react(grid, mats, i, m, false, tick);
      if (fc & ACT_REACT && c !== 0 && mat[i] !== 0) react(grid, mats, i, c, true, tick);
      if (alive) {
        if (x < aMinX) aMinX = x;
        if (x > aMaxX) aMaxX = x;
        if (y < aMinY) aMinY = y;
        if (y > aMaxY) aMaxY = y;
      }
    }
  }
  if (aMaxX >= 0) grid.extendReact(aMinX - 1, aMinY - 1, aMaxX + 1, aMaxY + 1);
}

/** End of turn: cells with `decay.turns` age by one turn and convert when due (lava cools). */
export function turnDecay(grid: Grid, mats: MaterialTable): void {
  if (grid.turnMaxX < grid.turnMinX) return;
  const W = grid.width;
  const x0 = grid.turnMinX;
  const x1 = grid.turnMaxX;
  const y0 = grid.turnMinY;
  const y1 = grid.turnMaxY;
  grid.turnMaxX = -1;
  grid.turnMinX = 0;
  const mat = grid.material;
  const state = grid.cellState;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
      const m = mat[i]!;
      const need = mats.decayTurns[m]!;
      if (m === 0 || need === 0) continue;
      const t = (state[i]! >> 6) + 1;
      if (t >= need) {
        setCell(grid, i, mats.decayInto[m]!);
        grid.markDirty(x, y, x, y);
      } else {
        state[i] = (state[i]! & AGE_MASK) | (t << 6);
        grid.extendTurn(x, y);
      }
    }
  }
}

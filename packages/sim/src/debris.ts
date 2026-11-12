import { FP } from '@mudders/shared';
import { grainShade, type Grid } from './grid';
import { SETTLE_FALL, SETTLE_SLIDE, type MaterialTable } from './materials';

/** Upper bound on simultaneous debris particles. */
export const DEBRIS_CAP = 32768;
/** How many cells deep a landing grain of loose ground can dig into the loose ground under it. */
const LAND_CHURN = 5;
/** Max cells a landed particle rolls downhill before it sticks. */
const ROLL_STEPS = 24;

/**
 * Sim particles (§2a, §5.2): cells knocked loose that fly ballistically and become terrain again
 * where they land. Unlike cosmetic GPU particles these are part of the deterministic state.
 * Struct-of-arrays, fixed-point, preallocated; removal swaps with the last particle.
 */
export class DebrisPool {
  count = 0;
  readonly x = new Int32Array(DEBRIS_CAP);
  readonly y = new Int32Array(DEBRIS_CAP);
  readonly vx = new Int32Array(DEBRIS_CAP);
  readonly vy = new Int32Array(DEBRIS_CAP);
  readonly mat = new Uint8Array(DEBRIS_CAP);
  readonly coat = new Uint8Array(DEBRIS_CAP);
  readonly state = new Uint8Array(DEBRIS_CAP);
  /** Cosmetic grain shade (`Grid.shade`) the cell lands with; not part of the state. */
  readonly shade = new Uint8Array(DEBRIS_CAP);

  /**
   * Returns false when the pool is full (the caller leaves the cell in place). `shade` is the
   * cell's cosmetic grain (`Grid.shadeOf`); without it the spawn position picks one.
   */
  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    m: number,
    coat: number,
    state: number,
    shade = 0,
  ): boolean {
    const i = this.count;
    if (i >= DEBRIS_CAP) return false;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.mat[i] = m;
    this.coat[i] = coat;
    this.state[i] = state;
    this.shade[i] = shade !== 0 ? shade : grainShade(Math.floor(x / FP), Math.floor(y / FP));
    this.count = i + 1;
    return true;
  }

  private remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.mat[i] = this.mat[last]!;
    this.coat[i] = this.coat[last]!;
    this.state[i] = this.state[last]!;
    this.shade[i] = this.shade[last]!;
  }

  /**
   * Advance every particle one tick under gravity (fixed-point), tracing cell by cell. A particle
   * that would enter a solid cell or the floor lands in the last free cell it passed (or the
   * nearest air above it); one that leaves the map sideways is lost.
   */
  step(grid: Grid, gravity: number, mats?: MaterialTable): void {
    const W = grid.width;
    const H = grid.height;
    const m = grid.material;
    let minX = W;
    let maxX = -1;
    let minY = H;
    let maxY = -1;
    for (let i = 0; i < this.count;) {
      const x0 = this.x[i]!;
      const y0 = this.y[i]!;
      const vy = this.vy[i]! + gravity;
      this.vy[i] = vy;
      const dx = this.vx[i]!;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(vy)) / FP));
      let lx = Math.floor(x0 / FP);
      let ly = Math.floor(y0 / FP);
      let landed = false;
      let lost = false;
      for (let s = 1; s <= n; s++) {
        const cx = Math.floor((x0 + Math.trunc((dx * s) / n)) / FP);
        const cy = Math.floor((y0 + Math.trunc((vy * s) / n)) / FP);
        if (cx < 0 || cx >= W) {
          lost = true;
          break;
        }
        if (cy >= H || (cy >= 0 && m[cy * W + cx] !== 0)) {
          landed = true;
          break;
        }
        lx = cx;
        ly = cy;
      }
      if (lost) {
        this.remove(i);
        continue;
      }
      if (!landed) {
        this.x[i] = x0 + dx;
        this.y[i] = y0 + vy;
        i++;
        continue;
      }
      // Land in the last free cell, or the nearest air above it.
      let y = Math.max(0, ly);
      for (let k = 0; k < 64 && y > 0 && m[y * W + lx] !== 0; k++) y--;
      // Roll off peaks like loose dirt (45° repose), so landed debris forms mounds, not combs;
      // a grain that came in sideways tries the way it was heading first (it skids on).
      for (let r = 0; r < ROLL_STEPS && y < H - 1; r++) {
        const d = dx > FP >> 2 ? 1 : dx < -(FP >> 2) ? -1 : ((lx + y + r) & 1) === 0 ? 1 : -1;
        const below = (y + 1) * W + lx;
        if (m[below] === 0) {
          y++;
          continue;
        }
        if (lx + d >= 0 && lx + d < W && m[y * W + lx + d] === 0 && m[below + d] === 0) lx += d;
        else if (lx - d >= 0 && lx - d < W && m[y * W + lx - d] === 0 && m[below - d] === 0)
          lx -= d;
        else break;
        y++;
      }
      const t = y * W + lx;
      if (m[t] === 0) {
        m[t] = this.mat[i]!;
        grid.coating[t] = this.coat[i]!;
        grid.cellState[t] = this.state[i]!;
        grid.shade[t] = this.shade[i]!;
        grid.fallVel[t] = 0;
        // Landed cells rest on solid ground by construction; only one that ran out of roll
        // steps mid-air needs the settle pass. Render-wise the whole landing box is dirty.
        if (y < H - 1 && m[t + W] === 0) grid.markDirty(lx, y, lx, y);
        else if (
          mats &&
          (mats.active[m[t]!] !== 0 ||
            mats.decayTurns[m[t]!] !== 0 ||
            mats.active[grid.coating[t]!] !== 0)
        )
          grid.extendReact(lx - 1, y - 1, lx + 1, y + 1);
        // A grain of loose ground digs in where it lands: it may swap with the loose ground under
        // it, a few cells deep, so thrown earth ends up mixed into the turf and sand it fell on
        // (some of that comes up on top) instead of lying on it as a clean strip.
        let low = y;
        if (mats) {
          const lm = m[t]!;
          const kind = mats.settle;
          const kl = kind[lm]!;
          if (
            (kl === SETTLE_FALL || kl === SETTLE_SLIDE) &&
            mats.active[lm] === 0 &&
            mats.decayTurns[lm] === 0
          ) {
            for (let c = 0, at = t; c < LAND_CHURN && low < H - 1; c++) {
              const un = at + W;
              const o = m[un]!;
              const ko = kind[o]!;
              if (o === 0 || (ko !== SETTLE_FALL && ko !== SETTLE_SLIDE)) break;
              if (grid.group[un] !== 0 || mats.active[o] !== 0 || mats.decayTurns[o] !== 0) break;
              const roll =
                ((Math.imul(lx + c * 31, 374761393) ^ Math.imul(low + i, 668265263)) >>> 13) & 7;
              if (roll >= 5) break;
              const sh = grid.shadeOf(at);
              grid.shade[at] = grid.shadeOf(un);
              grid.shade[un] = sh;
              if (o !== lm) {
                m[un] = lm;
                m[at] = o;
                const cs = grid.coating[at]!;
                grid.coating[at] = grid.coating[un]!;
                grid.coating[un] = cs;
                const ss = grid.cellState[at]!;
                grid.cellState[at] = grid.cellState[un]!;
                grid.cellState[un] = ss;
              }
              at = un;
              low++;
            }
          }
        }
        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
        if (y < minY) minY = y;
        if (low > maxY) maxY = low;
      }
      this.remove(i);
    }
    if (maxX >= 0) grid.addRenderRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
  }
}

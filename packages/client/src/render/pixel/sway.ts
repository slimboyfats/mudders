/**
 * Trees in the wind (renderer only, the sim never sees it). Each frame the background shader
 * moves every swaying cell sideways by a whole number of cells: a lean with the wind plus a slow
 * rock that rolls across the map as gusts pass, scaled by how high the cell stands above the
 * ground it grows from (trees bend from the root), and loose leaves flicker a cell now and then.
 *
 * This module builds the per-cell field the shader reads (`u_sway`, R8UI):
 *   0            nothing that sways is within reach: draw the cell as it is
 *   SWAY_NEAR    open air (or a cell beside a tree) a swaying cell may land on: look around
 *   2 + weight   a swaying cell; weight / SWAY_UNIT is its bend (0 at the root), and
 *   | SWAY_LEAF  set for canopy cells, which also rustle
 */

/** Air or ground beside a swaying cell: the shader gathers from its neighbours here. */
export const SWAY_NEAR = 1;
/** Bit for canopy cells (they rustle). */
export const SWAY_LEAF = 128;
/** Weight units per cell of bend at full wind. */
export const SWAY_UNIT = 50;
/** Furthest a cell is ever drawn from home, in cells (the shader's gather window). */
export const SWAY_REACH = 6;
/** Height over the root at which a cell bends one full unit; the bend grows as h^1.5. */
const BEND_ROWS = 28;
/** Rows of open air a limb may have between it and the canopy it holds up. */
const LIMB_GAP = 3;

/**
 * Per material cell: flex 0–100 (0 = never sways) and whether it is a limb (sways only in a
 * column that also holds canopy).
 */
export interface SwayLooks {
  flex: Uint8Array;
  limb: Uint8Array;
}

export function swayLooks(
  looks: readonly { cell: number; sway?: number; limb?: boolean }[],
): SwayLooks {
  const flex = new Uint8Array(256);
  const limb = new Uint8Array(256);
  for (const l of looks) {
    if (l.cell <= 0 || l.cell > 255 || !l.sway) continue;
    flex[l.cell] = Math.max(1, Math.min(100, Math.round(l.sway * 100)));
    limb[l.cell] = l.limb ? 1 : 0;
  }
  return { flex, limb };
}

/** Bend weight of a cell `h` rows above its root (before flex), in SWAY_UNITs. */
export function bend(h: number): number {
  const t = Math.min(h, 2 * BEND_ROWS) / BEND_ROWS;
  return t * Math.sqrt(t);
}

/**
 * Build the field into `out` (w × h, row-major, row 0 at the top). Returns whether anything sways.
 * One pass up each column finds the runs of swaying cells and the ground they stand on, a second
 * marks the cells each one could be drawn over. `run` is scratch of at least `h` entries.
 */
export function swayField(
  t: Uint8Array,
  w: number,
  h: number,
  looks: SwayLooks,
  out: Uint8Array,
  run: Int32Array,
): boolean {
  out.fill(0);
  const { flex, limb } = looks;
  let any = false;
  for (let x = 0; x < w; x++) {
    // walk up from the bottom; root = the row just above the last solid that doesn't sway
    let root = h;
    let y = h - 1;
    while (y >= 0) {
      const m = t[y * w + x]!;
      if (m === 0) {
        y--;
        continue;
      }
      if (flex[m] === 0) {
        root = y;
        y--;
        continue;
      }
      // a run of swaying cells (open gaps of up to LIMB_GAP rows inside it are allowed)
      let n = 0;
      let canopy = false;
      let gap = 0;
      let yy = y;
      while (yy >= 0) {
        const mm = t[yy * w + x]!;
        if (mm === 0) {
          if (++gap > LIMB_GAP) break;
        } else if (flex[mm] === 0) break;
        else {
          gap = 0;
          if (limb[mm] === 0) canopy = true;
          run[n++] = yy;
        }
        yy--;
      }
      for (let i = 0; i < n; i++) {
        const ry = run[i]!;
        const mm = t[ry * w + x]!;
        if (limb[mm] !== 0 && !canopy) continue; // a house wall or roof beam: stays put
        const b = bend(root - ry);
        const wt = Math.min(125, Math.round((b * flex[mm]! * SWAY_UNIT) / 100));
        out[ry * w + x] = (2 + wt) | (limb[mm] === 0 ? SWAY_LEAF : 0);
        any = true;
      }
      // carry on above the run (a solid that broke it becomes the next root there)
      y = yy;
    }
  }
  if (!any) return false;
  // mark the cells a swaying cell could be drawn over: within SWAY_REACH along its row
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let last = -1_000_000;
    for (let x = 0; x < w; x++) {
      if (out[o + x]! >= 2) last = x;
      else if (x - last <= SWAY_REACH) out[o + x] = SWAY_NEAR;
    }
    last = 1_000_000;
    for (let x = w - 1; x >= 0; x--) {
      if (out[o + x]! >= 2) last = x;
      else if (last - x <= SWAY_REACH && out[o + x] === 0) out[o + x] = SWAY_NEAR;
    }
  }
  return true;
}

/** Wind at which trees bend their furthest (the classic mode's top wind). */
const FULL_WIND = 0.012;

/**
 * The shader's sway uniforms for this frame's `wind` (cells/tick², + blows right): a lean with
 * the wind, a rock that grows with it (still air keeps a gentle breath), canopy rustle, and a
 * rolling phase that travels downwind. `motion` false (reduced motion) halves the rock.
 */
export function swayWind(
  wind: number,
  motion: boolean,
): { lean: number; amp: number; rustle: number; speed: number; k: number } {
  const n = Math.max(-1, Math.min(1, wind / FULL_WIND));
  const a = Math.abs(n);
  return {
    lean: n * 1.4,
    amp: (0.45 + 0.85 * a) * (motion ? 1 : 0.5),
    rustle: motion ? 0.02 + 0.1 * a : 0,
    speed: 0.035 + 0.045 * a,
    k: n < 0 ? -0.045 : 0.045,
  };
}

/** Blasts the trees whip away from at once (shader uniforms). */
export const SWAY_BLASTS = 4;
/** Ticks a tree keeps wobbling after a blast. */
export const SWAY_BLAST_TICKS = 260;

/**
 * Recent blasts as the shader reads them: x, y, reach (cells) and tick, newest replacing the
 * oldest. A blast whips every tree within reach away from it as its front arrives, then the tree
 * springs back and wobbles out.
 */
export class SwayBlasts {
  readonly data = new Float32Array(SWAY_BLASTS * 4);
  count = 0;
  private next = 0;

  add(x: number, y: number, radius: number, tick: number): void {
    const o = this.next * 4;
    this.data[o] = x;
    this.data[o + 1] = y;
    this.data[o + 2] = Math.max(48, radius * 6);
    this.data[o + 3] = tick;
    this.next = (this.next + 1) % SWAY_BLASTS;
    this.count = Math.min(SWAY_BLASTS, this.count + 1);
  }

  /** Whether any blast is still shaking trees at `tick`. */
  live(tick: number): boolean {
    for (let i = 0; i < this.count; i++)
      if (tick - this.data[i * 4 + 3]! < SWAY_BLAST_TICKS) return true;
    return false;
  }

  clear(): void {
    this.count = 0;
    this.next = 0;
  }
}

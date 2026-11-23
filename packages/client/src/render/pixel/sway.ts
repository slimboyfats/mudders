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
 *
 * A column's cells depend on that column alone, and the marks on what sways within SWAY_REACH
 * along the row. So when only columns `x0..x1` of the terrain changed since `out` was last built,
 * passing them (with `count`, the swaying cells per column, kept between calls) rebuilds just
 * those columns and the marks around them: the result is the same as a whole rebuild, without
 * walking the whole map for one crater. Without `count` the whole field is always rebuilt.
 *
 * Two things from {@link scanCells} make it cheaper still, with the same result: `low` (one more
 * than the lowest swaying row per column, 0 = none) lets a column start at its lowest swaying
 * cell instead of the bottom of the map, and `y0..y1` are the only rows touched. Those must
 * span every row that holds a swaying cell now or held one when `out` was last built.
 */
export function swayField(
  t: Uint8Array,
  w: number,
  h: number,
  looks: SwayLooks,
  out: Uint8Array,
  run: Int32Array,
  x0 = 0,
  x1 = w - 1,
  count?: Int32Array,
  low?: Int32Array,
  y0 = 0,
  y1 = h - 1,
): boolean {
  if (!count || x0 < 0) x0 = 0;
  if (!count || x1 > w - 1) x1 = w - 1;
  if (x1 < x0) {
    if (!count) return false;
    for (let x = 0; x < w; x++) if (count[x] !== 0) return true;
    return false;
  }
  const whole = x0 === 0 && x1 === w - 1;
  if (y0 < 0) y0 = 0;
  if (y1 > h - 1) y1 = h - 1;
  if (whole) out.fill(0, y0 * w, (y1 + 1) * w);
  else {
    // the changed columns start empty; the marks beside them are worked out again below
    const m0 = Math.max(0, x0 - SWAY_REACH);
    const m1 = Math.min(w - 1, x1 + SWAY_REACH);
    for (let y = y0; y <= y1; y++) {
      const o = y * w;
      for (let x = m0; x < x0; x++) if (out[o + x] === SWAY_NEAR) out[o + x] = 0;
      out.fill(0, o + x0, o + x1 + 1);
      for (let x = x1 + 1; x <= m1; x++) if (out[o + x] === SWAY_NEAR) out[o + x] = 0;
    }
  }
  const { flex, limb } = looks;
  let any = false;
  for (let x = x0; x <= x1; x++) {
    let cells = 0;
    // walk up from the bottom; root = the row just above the last solid that doesn't sway
    let root = h;
    let y = h - 1;
    if (low) {
      // nothing sways below `low`: start there, standing on the first solid cell under it
      y = low[x]! - 1;
      for (let r = y + 1; y >= 0 && r < h; r++) {
        if (t[r * w + x] !== 0) {
          root = r;
          break;
        }
      }
    }
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
        cells++;
      }
      // carry on above the run (a solid that broke it becomes the next root there)
      y = yy;
    }
    if (cells > 0) any = true;
    if (count) count[x] = cells;
  }
  if (!any && count && !whole) for (let x = 0; x < w && !any; x++) any = count[x] !== 0;
  if (!any) return false;
  // mark the cells a swaying cell could be drawn over: within SWAY_REACH along its row (a mark
  // by the changed columns can come from a swaying cell up to twice that far from them)
  const a = Math.max(0, x0 - 2 * SWAY_REACH);
  const z = Math.min(w - 1, x1 + 2 * SWAY_REACH);
  for (let y = y0; y <= y1; y++) {
    const o = y * w;
    let last = -1_000_000;
    for (let x = a; x <= z; x++) {
      if (out[o + x]! >= 2) last = x;
      else if (x - last <= SWAY_REACH) out[o + x] = SWAY_NEAR;
    }
    last = 1_000_000;
    for (let x = z; x >= a; x--) {
      if (out[o + x]! >= 2) last = x;
      else if (last - x <= SWAY_REACH && out[o + x] === 0) out[o + x] = SWAY_NEAR;
    }
  }
  return true;
}

/** Whether typed-array words read low byte first (every phone and desktop this runs on). */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** The rows that hold swaying cells: `top` and `bottom` (-1 and -1 when there are none). */
export interface SwayRows {
  top: number;
  bottom: number;
}

/**
 * One pass over a cell layer for the look scan: ORs `flags[cell]` of every cell and, when `flex`
 * and `low` are given, sets `low[x]` to one more than the lowest row with a swaying cell in
 * column `x` (of `w`; clear `low` first, 0 = none) and `rows` to the rows they span. Cells are
 * read four at a time, and a word equal to the one before it (air, the inside of the ground:
 * nearly all of a map) is passed in one compare unless that word held a swaying cell. The result
 * is the same as looking at every cell.
 */
export function scanCells(
  cells: Uint8Array,
  flags: Uint8Array,
  w = 0,
  flex?: Uint8Array,
  low?: Int32Array,
  rows?: SwayRows,
): number {
  let any = 0;
  const n = cells.length;
  let first = -1;
  let last = -1;
  let i = 0;
  if (LITTLE_ENDIAN && cells.byteOffset % 4 === 0) {
    const words = new Uint32Array(cells.buffer, cells.byteOffset, n >> 2);
    let prev = -1;
    let prevFlex = false;
    for (let k = 0; k < words.length; k++) {
      const wd = words[k]!;
      if (wd === prev && !prevFlex) continue;
      prev = wd;
      const a = wd & 255;
      const b = (wd >>> 8) & 255;
      const c = (wd >>> 16) & 255;
      const d = wd >>> 24;
      any |= flags[a]! | flags[b]! | flags[c]! | flags[d]!;
      if (!flex || !low) continue;
      prevFlex = (flex[a]! | flex[b]! | flex[c]! | flex[d]!) !== 0;
      if (!prevFlex) continue;
      for (let j = k << 2, e = j + 4; j < e; j++) {
        if (flex[cells[j]!] === 0) continue;
        const x = j % w;
        low[x] = (j - x) / w + 1;
        if (first < 0) first = j;
        last = j;
      }
    }
    i = words.length << 2;
  }
  for (; i < n; i++) {
    const m = cells[i]!;
    any |= flags[m]!;
    if (flex && low && flex[m] !== 0) {
      const x = i % w;
      low[x] = (i - x) / w + 1;
      if (first < 0) first = i;
      last = i;
    }
  }
  if (rows && w > 0) {
    rows.top = first < 0 ? -1 : Math.floor(first / w);
    rows.bottom = last < 0 ? -1 : Math.floor(last / w);
  }
  return any;
}

/** Cells along a row that one look-scan tile covers. */
const LOOK_TILE = 64;

/**
 * `scanCells` kept up to date: the flags of every 64 cells of a row are remembered, and after a
 * change only the tiles its box touches are read again. Between two look scans the cells that
 * change lie in a strip a few hundred rows high and some hundred columns wide (a crater, the
 * rain's puddles), an eighth of the map on average, while the scan read all of it: 2 ms on a
 * desktop and a dropped frame on a phone, three times a second. The answers are the same as
 * `scanCells` gives for the whole layer, as long as every changed cell is inside a reported box
 * (the picture depends on that too: only those boxes are uploaded).
 */
export class LookScan {
  private readonly tw: number;
  /** Flags of each tile, row by row. */
  private readonly tiles: Uint8Array;
  /** Whether each tile holds a swaying cell. */
  private readonly flexTiles: Uint8Array;
  /** Per column, one more than the lowest swaying row inside the box being read (scratch). */
  private readonly boxLow: Int32Array;
  private fresh = true;

  constructor(
    private readonly w: number,
    private readonly h: number,
  ) {
    this.tw = Math.ceil(w / LOOK_TILE);
    this.tiles = new Uint8Array(this.tw * h);
    this.flexTiles = new Uint8Array(this.tw * h);
    this.boxLow = new Int32Array(w);
  }

  /** Forget everything: the next `scan` reads the whole layer (new cells, new flags). */
  reset(): void {
    this.fresh = true;
  }

  /**
   * The flags of the whole layer, after reading again the cells of the inclusive box
   * (`x1 < x0` = nothing changed). `low` (cleared by the caller only before the first scan, then
   * left alone) and `rows` are kept as `scanCells` would set them.
   */
  scan(
    cells: Uint8Array,
    flags: Uint8Array,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    flex?: Uint8Array,
    low?: Int32Array,
    rows?: SwayRows,
  ): number {
    const w = this.w;
    const h = this.h;
    const tw = this.tw;
    const tiles = this.tiles;
    const flexTiles = this.flexTiles;
    if (this.fresh) {
      this.fresh = false;
      x0 = 0;
      y0 = 0;
      x1 = w - 1;
      y1 = h - 1;
      low?.fill(0);
    }
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(w - 1, x1);
    y1 = Math.min(h - 1, y1);
    if (x1 >= x0 && y1 >= y0) {
      const t0 = Math.floor(x0 / LOOK_TILE);
      const t1 = Math.floor(x1 / LOOK_TILE);
      const c0 = t0 * LOOK_TILE;
      const c1 = Math.min(w, (t1 + 1) * LOOK_TILE) - 1;
      const sway = flex !== undefined && low !== undefined;
      const boxLow = this.boxLow;
      if (sway) boxLow.fill(0, c0, c1 + 1);
      const byWord = LITTLE_ENDIAN && cells.byteOffset % 4 === 0 && w % 4 === 0;
      const words = byWord
        ? new Uint32Array(cells.buffer, cells.byteOffset, cells.length >> 2)
        : null;
      for (let y = y0; y <= y1; y++) {
        const row = y * w;
        for (let tx = t0; tx <= t1; tx++) {
          const a = row + tx * LOOK_TILE;
          const b = Math.min(row + w, a + LOOK_TILE);
          let any = 0;
          let bends = 0;
          if (words) {
            let prev = -1;
            let prevFlex = false;
            for (let k = a >> 2, e = b >> 2; k < e; k++) {
              const wd = words[k]!;
              if (wd === prev && !prevFlex) continue;
              prev = wd;
              const m0 = wd & 255;
              const m1 = (wd >>> 8) & 255;
              const m2 = (wd >>> 16) & 255;
              const m3 = wd >>> 24;
              any |= flags[m0]! | flags[m1]! | flags[m2]! | flags[m3]!;
              if (!sway) continue;
              prevFlex = (flex[m0]! | flex[m1]! | flex[m2]! | flex[m3]!) !== 0;
              if (!prevFlex) continue;
              bends = 1;
              const j = k << 2;
              if (flex[m0] !== 0) boxLow[j - row] = y + 1;
              if (flex[m1] !== 0) boxLow[j + 1 - row] = y + 1;
              if (flex[m2] !== 0) boxLow[j + 2 - row] = y + 1;
              if (flex[m3] !== 0) boxLow[j + 3 - row] = y + 1;
            }
          } else {
            for (let i = a; i < b; i++) {
              const m = cells[i]!;
              any |= flags[m]!;
              if (sway && flex[m] !== 0) {
                bends = 1;
                boxLow[i - row] = y + 1;
              }
            }
          }
          tiles[y * tw + tx] = any;
          flexTiles[y * tw + tx] = bends;
        }
      }
      if (sway) {
        for (let x = c0; x <= c1; x++) {
          const old = low[x]! - 1;
          // a swaying cell under the box is still the lowest; one found in the box is lower
          // than any above it
          if (old > y1) continue;
          if (boxLow[x] !== 0) low[x] = boxLow[x]!;
          else if (old >= y0) {
            // the lowest was in the box and is gone: the next one up, if the column has one
            let r = y0 - 1;
            while (r >= 0 && flex[cells[r * w + x]!] === 0) r--;
            low[x] = r + 1;
          }
        }
      }
    }
    let any = 0;
    for (let i = 0; i < tiles.length; i++) any |= tiles[i]!;
    if (rows) {
      let top = -1;
      let bottom = -1;
      for (let i = 0; i < flexTiles.length && top < 0; i++) {
        if (flexTiles[i] !== 0) top = Math.floor(i / tw);
      }
      for (let i = flexTiles.length - 1; i >= 0 && bottom < 0; i--) {
        if (flexTiles[i] !== 0) bottom = Math.floor(i / tw);
      }
      rows.top = top;
      rows.bottom = bottom;
    }
    return any;
  }

  /**
   * The cells from row 1 down whose flags have `bit` and that have air above them, in reading
   * order, into `out` (at most `out.length`); returns how many. Only tiles with the bit are read.
   */
  open(cells: Uint8Array, flags: Uint8Array, bit: number, out: Int32Array): number {
    const w = this.w;
    const tw = this.tw;
    const tiles = this.tiles;
    let n = 0;
    for (let y = 1; y < this.h && n < out.length; y++) {
      const row = y * w;
      for (let tx = 0; tx < tw && n < out.length; tx++) {
        if ((tiles[y * tw + tx]! & bit) === 0) continue;
        const a = row + tx * LOOK_TILE;
        const b = Math.min(row + w, a + LOOK_TILE);
        for (let i = a; i < b && n < out.length; i++) {
          if ((flags[cells[i]!]! & bit) !== 0 && cells[i - w] === 0) out[n++] = i;
        }
      }
    }
    return n;
  }
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

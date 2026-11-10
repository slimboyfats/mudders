import type { Rect } from '@mudders/shared';

const MAX_RENDER_RECTS = 8;

/**
 * The cosmetic grain shade a cell at (x, y) shows while it rests where the map put it: the same
 * integer hash the terrain shader uses on its 2×2 "art pixel" (`hash(c >> 1)` in `TERRAIN_FS`),
 * in 63 steps, packed with two bits of the cell's own hash for single-grain flecks. Never 0
 * (0 = "not moved yet, use the position").
 */
export function grainShade(x: number, y: number): number {
  const ax = x >> 1;
  const ay = y >> 1;
  let h = (Math.imul(ax, 374761393) + Math.imul(ay, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  const tone = Math.min(62, Math.floor(((h & 1023) * 63) / 1024));
  let f = (Math.imul(x, 2246822519) ^ Math.imul(y, 3266489917)) >>> 0;
  f = Math.imul(f ^ (f >>> 15), 668265263) >>> 0;
  return ((tone + 1) << 2) | ((f >>> 7) & 3);
}

/**
 * The terrain grid (§4.1): one byte of material per cell, plus a coating layer, a per-cell state
 * byte for effects, and the kernel's settle velocity. Row-major, y = 0 is the top row.
 *
 * Two kinds of dirty tracking:
 * - the **settle region**: columns [minX, maxX] from row 0 down to maxY, the only area settle scans;
 * - **render rects**: union rects of everything changed since the last snapshot (§2a).
 */
export class Grid {
  readonly size: number;
  readonly material: Uint8Array;
  readonly coating: Uint8Array;
  /**
   * Gas layer: a gas material per cell (0 = none), only ever in cells whose `material` is air, so
   * everything that treats air as empty (shells, tanks, settle) flies straight through it.
   */
  readonly gas: Uint8Array;
  readonly cellState: Uint8Array;
  /** Settle fall speed per cell (cells/tick). Kernel-owned. */
  readonly fallVel: Uint8Array;
  /** Prop integrity group per cell (§4c), 0 = none. Kernel-owned. */
  readonly group: Uint8Array;
  /** The material a group cell is meant to hold; ops that change it are undone while intact. */
  readonly groupMat: Uint8Array;
  /**
   * Cosmetic grain shade per cell (`grainShade`), carried along when settle or debris moves a
   * cell, so falling sand and flowing liquid keep their grains instead of shimmering through a
   * fixed pattern. 0 = the cell never moved. Render-only: not hashed, never read by the sim.
   */
  readonly shade: Uint8Array;
  /** Group cells lost outside ops (burnt, collapsed edge) since the kernel last looked. */
  readonly groupLost = new Int32Array(256);
  groupLostAny = false;
  /**
   * Bursts the reaction pass queued this tick (lit gunpowder going off): cell index and material
   * pairs. The kernel drains it right after `reactStep`; extra bursts past the cap are dropped.
   */
  readonly bursts = new Int32Array(128);
  burstCount = 0;

  /** Union of everything `markDirty` touched since `clearWatch` (inclusive; empty if max < min). */
  watchMinX = 0;
  watchMaxX = -1;
  watchMinY = 0;
  watchMaxY = -1;

  settleMinX = 0;
  settleMaxX = -1;
  settleMaxY = -1;

  /**
   * Structure box (inclusive rect): where terrain changed or moved since the last `supportPass`,
   * which runs over it (and what may hang from it) once the grid is still. Empty if max < min.
   */
  structMinX = 0;
  structMaxX = -1;
  structMinY = 0;
  structMaxY = -1;

  /** Reaction region (inclusive rect): recently changed cells, checked by `reactStep`. */
  reactMinX = 0;
  reactMaxX = -1;
  reactMinY = 0;
  reactMaxY = -1;
  /**
   * Process counters for the snapshot (cosmetic: the soundscape and effects read them; never
   * hashed, reset at each snapshot): gas cells and burning gas cells at the last gas pass, and
   * wet gas (steam) born from reactions since the last snapshot.
   */
  gasCells = 0;
  gasHot = 0;
  quenched = 0;
  /** Gas region (inclusive rect): where gas cells are, stepped by `gasStep`. */
  gasMinX = 0;
  gasMaxX = -1;
  gasMinY = 0;
  gasMaxY = -1;
  /** Bounding box of cells with turn-based decay (lava cooling), checked once per turn. */
  turnMinX = 0;
  turnMaxX = -1;
  turnMinY = 0;
  turnMaxY = -1;

  /**
   * Bursting cells (gas pockets) `reactStep` found touching air this tick, for the world to set
   * off. Transient: emptied every tick, never part of the state.
   */
  readonly pockets = new Int32Array(32);
  pocketCount = 0;

  private renderRects: Rect[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.size = width * height;
    this.material = new Uint8Array(this.size);
    this.coating = new Uint8Array(this.size);
    this.gas = new Uint8Array(this.size);
    this.cellState = new Uint8Array(this.size);
    this.fallVel = new Uint8Array(this.size);
    this.group = new Uint8Array(this.size);
    this.groupMat = new Uint8Array(this.size);
    this.shade = new Uint8Array(this.size);
  }

  /** Empty every layer and region (new round). */
  reset(): void {
    this.material.fill(0);
    this.coating.fill(0);
    this.gas.fill(0);
    this.gasMaxX = -1;
    this.cellState.fill(0);
    this.fallVel.fill(0);
    this.group.fill(0);
    this.groupMat.fill(0);
    this.shade.fill(0);
    this.groupLost.fill(0);
    this.groupLostAny = false;
    this.burstCount = 0;
    this.pocketCount = 0;
    this.clearWatch();
    this.clearSettle();
    this.clearReact();
    this.turnMaxX = -1;
    this.renderRects = [];
  }

  get gassy(): boolean {
    return this.gasMaxX >= this.gasMinX && this.gasMaxY >= this.gasMinY;
  }

  /** Grow the gas region to include a cell. */
  extendGas(x: number, y: number): void {
    if (!this.gassy) {
      this.gasMinX = this.gasMaxX = x;
      this.gasMinY = this.gasMaxY = y;
      return;
    }
    if (x < this.gasMinX) this.gasMinX = x;
    if (x > this.gasMaxX) this.gasMaxX = x;
    if (y < this.gasMinY) this.gasMinY = y;
    if (y > this.gasMaxY) this.gasMaxY = y;
  }

  /** Put gas `g` into air cell `i` (no-op unless the cell is air). */
  putGas(i: number, g: number): void {
    if (this.material[i] !== 0) return;
    this.gas[i] = g;
    const x = i % this.width;
    this.extendGas(x, (i - x) / this.width);
  }

  get reacting(): boolean {
    return this.reactMaxX >= this.reactMinX && this.reactMaxY >= this.reactMinY;
  }

  clearReact(): void {
    this.reactMinX = 0;
    this.reactMaxX = -1;
    this.reactMinY = 0;
    this.reactMaxY = -1;
  }

  /** Grow the reaction region by an inclusive rect (clamped). */
  extendReact(x0: number, y0: number, x1: number, y1: number): void {
    const ax = Math.max(0, x0);
    const bx = Math.min(this.width - 1, x1);
    const ay = Math.max(0, y0);
    const by = Math.min(this.height - 1, y1);
    if (bx < ax || by < ay) return;
    if (this.reacting) {
      if (ax < this.reactMinX) this.reactMinX = ax;
      if (bx > this.reactMaxX) this.reactMaxX = bx;
      if (ay < this.reactMinY) this.reactMinY = ay;
      if (by > this.reactMaxY) this.reactMaxY = by;
    } else {
      this.reactMinX = ax;
      this.reactMaxX = bx;
      this.reactMinY = ay;
      this.reactMaxY = by;
    }
  }

  extendTurn(x: number, y: number): void {
    if (this.turnMaxX < this.turnMinX) {
      this.turnMinX = this.turnMaxX = x;
      this.turnMinY = this.turnMaxY = y;
      return;
    }
    if (x < this.turnMinX) this.turnMinX = x;
    if (x > this.turnMaxX) this.turnMaxX = x;
    if (y < this.turnMinY) this.turnMinY = y;
    if (y > this.turnMaxY) this.turnMaxY = y;
  }

  clearWatch(): void {
    this.watchMinX = 0;
    this.watchMaxX = -1;
    this.watchMinY = 0;
    this.watchMaxY = -1;
  }

  /** A group cell stops belonging to its group (burnt, washed, dropped off the map). */
  leaveGroup(i: number): void {
    const g = this.group[i]!;
    if (g === 0) return;
    this.group[i] = 0;
    this.groupLost[g] = this.groupLost[g]! + 1;
    this.groupLostAny = true;
  }

  /** Turn a cell into air (every layer). Call `markDirty` afterwards. */
  clearCell(i: number): void {
    this.leaveGroup(i);
    this.material[i] = 0;
    this.coating[i] = 0;
    this.gas[i] = 0;
    this.cellState[i] = 0;
    this.fallVel[i] = 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): number {
    return this.inBounds(x, y) ? this.material[y * this.width + x]! : 0;
  }

  /** The shade a cell carries when it moves: its own, or the one its position gave it. */
  shadeOf(i: number): number {
    const s = this.shade[i]!;
    if (s !== 0) return s;
    const x = i % this.width;
    return grainShade(x, (i - x) / this.width);
  }

  /** Raw write; call `markDirty` for the affected area afterwards. */
  set(x: number, y: number, m: number): void {
    if (this.inBounds(x, y)) this.material[y * this.width + x] = m;
  }

  get settling(): boolean {
    return this.settleMaxX >= this.settleMinX && this.settleMaxY >= 0;
  }

  /** Mark an inclusive rect as changed: it will be settled, re-checked for reactions and re-uploaded. */
  markDirty(x0: number, y0: number, x1: number, y1: number): void {
    const ax = Math.max(0, Math.min(x0, x1));
    const bx = Math.min(this.width - 1, Math.max(x0, x1));
    const ay = Math.max(0, Math.min(y0, y1));
    const by = Math.min(this.height - 1, Math.max(y0, y1));
    if (bx < ax || by < ay) return;
    this.extendSettle(ax - 1, bx + 1, by + 1);
    this.extendReact(ax - 1, ay - 1, bx + 1, by + 1);
    this.extendStruct(ax, ay, bx, by);
    this.addRenderRect(ax, ay, bx - ax + 1, by - ay + 1);
    if (this.watchMaxX < this.watchMinX) {
      this.watchMinX = ax;
      this.watchMaxX = bx;
      this.watchMinY = ay;
      this.watchMaxY = by;
    } else {
      if (ax < this.watchMinX) this.watchMinX = ax;
      if (bx > this.watchMaxX) this.watchMaxX = bx;
      if (ay < this.watchMinY) this.watchMinY = ay;
      if (by > this.watchMaxY) this.watchMaxY = by;
    }
  }

  /** Extend the settle region (columns sx0..sx1, rows 0..sy). */
  extendSettle(sx0: number, sx1: number, sy: number): void {
    const x0 = Math.max(0, sx0);
    const x1 = Math.min(this.width - 1, sx1);
    const y = Math.min(this.height - 1, sy);
    if (this.settling) {
      this.settleMinX = Math.min(this.settleMinX, x0);
      this.settleMaxX = Math.max(this.settleMaxX, x1);
      this.settleMaxY = Math.max(this.settleMaxY, y);
    } else {
      this.settleMinX = x0;
      this.settleMaxX = x1;
      this.settleMaxY = y;
    }
  }

  /** Grow the structure box by an inclusive rect (clamped). */
  extendStruct(x0: number, y0: number, x1: number, y1: number): void {
    const ax = Math.max(0, x0);
    const bx = Math.min(this.width - 1, x1);
    const ay = Math.max(0, y0);
    const by = Math.min(this.height - 1, y1);
    if (bx < ax || by < ay) return;
    if (this.structMaxX < this.structMinX) {
      this.structMinX = ax;
      this.structMaxX = bx;
      this.structMinY = ay;
      this.structMaxY = by;
    } else {
      if (ax < this.structMinX) this.structMinX = ax;
      if (bx > this.structMaxX) this.structMaxX = bx;
      if (ay < this.structMinY) this.structMinY = ay;
      if (by > this.structMaxY) this.structMaxY = by;
    }
  }

  clearStruct(): void {
    this.structMinX = 0;
    this.structMaxX = -1;
    this.structMinY = 0;
    this.structMaxY = -1;
  }

  clearSettle(): void {
    this.settleMinX = 0;
    this.settleMaxX = -1;
    this.settleMaxY = -1;
  }

  addRenderRect(x0: number, y0: number, w0: number, h0: number): void {
    // clip to the map: a rect hanging off an edge (settle pads its region by DROP_LOOK) makes
    // the renderer's texture upload fail, and with it every change merged into that rect
    const x = Math.max(0, x0);
    const y = Math.max(0, y0);
    const w = Math.min(this.width, x0 + w0) - x;
    const h = Math.min(this.height, y0 + h0) - y;
    if (w <= 0 || h <= 0) return;
    const rects = this.renderRects;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]!;
      if (x <= r.x + r.w && r.x <= x + w && y <= r.y + r.h && r.y <= y + h) {
        const nx = Math.min(r.x, x);
        const ny = Math.min(r.y, y);
        r.w = Math.max(r.x + r.w, x + w) - nx;
        r.h = Math.max(r.y + r.h, y + h) - ny;
        r.x = nx;
        r.y = ny;
        return;
      }
    }
    rects.push({ x, y, w, h });
    if (rects.length > MAX_RENDER_RECTS) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const r of rects) {
        x0 = Math.min(x0, r.x);
        y0 = Math.min(y0, r.y);
        x1 = Math.max(x1, r.x + r.w);
        y1 = Math.max(y1, r.y + r.h);
      }
      this.renderRects = [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
    }
  }

  /** Render rects since the last call. */
  takeRenderRects(): Rect[] {
    const out = this.renderRects;
    this.renderRects = [];
    return out;
  }

  /** Surface row of column x: the first solid row from the top, or `height` if none. */
  surfaceY(x: number): number {
    if (x < 0 || x >= this.width) return this.height;
    const m = this.material;
    for (let y = 0, i = x; y < this.height; y++, i += this.width) if (m[i] !== 0) return y;
    return this.height;
  }
}

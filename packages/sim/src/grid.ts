import type { Rect } from '@mudders/shared';

const MAX_RENDER_RECTS = 8;

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
  readonly cellState: Uint8Array;
  /** Settle fall speed per cell (cells/tick). Kernel-owned. */
  readonly fallVel: Uint8Array;

  settleMinX = 0;
  settleMaxX = -1;
  settleMaxY = -1;

  /** Reaction region (inclusive rect): recently changed cells, checked by `reactStep`. */
  reactMinX = 0;
  reactMaxX = -1;
  reactMinY = 0;
  reactMaxY = -1;
  /** Bounding box of cells with turn-based decay (lava cooling), checked once per turn. */
  turnMinX = 0;
  turnMaxX = -1;
  turnMinY = 0;
  turnMaxY = -1;

  private renderRects: Rect[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.size = width * height;
    this.material = new Uint8Array(this.size);
    this.coating = new Uint8Array(this.size);
    this.cellState = new Uint8Array(this.size);
    this.fallVel = new Uint8Array(this.size);
  }

  /** Empty every layer and region (new round). */
  reset(): void {
    this.material.fill(0);
    this.coating.fill(0);
    this.cellState.fill(0);
    this.fallVel.fill(0);
    this.clearSettle();
    this.clearReact();
    this.turnMaxX = -1;
    this.renderRects = [];
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

  /** Turn a cell into air (every layer). Call `markDirty` afterwards. */
  clearCell(i: number): void {
    this.material[i] = 0;
    this.coating[i] = 0;
    this.cellState[i] = 0;
    this.fallVel[i] = 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): number {
    return this.inBounds(x, y) ? this.material[y * this.width + x]! : 0;
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
    this.addRenderRect(ax, ay, bx - ax + 1, by - ay + 1);
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

  clearSettle(): void {
    this.settleMinX = 0;
    this.settleMaxX = -1;
    this.settleMaxY = -1;
  }

  addRenderRect(x: number, y: number, w: number, h: number): void {
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

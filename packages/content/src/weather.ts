import type { SimApi } from '@mudders/sim';

/**
 * Shared helpers for `weather.*` behaviours. Integer maths and the match RNG only; every column is
 * visited in order so all peers draw the same numbers.
 */

/** 1 where a living tank stands (plus a cell either side), so weather never buries a tank. */
export function tankColumns(api: SimApi): Uint8Array {
  const W = api.grid.width;
  // once per turn, not a hot path
  const mask = new Uint8Array(W);
  for (const t of api.tanks) {
    if (!t.alive) continue;
    const a = Math.max(0, t.x - t.half - 1);
    const b = Math.min(W - 1, t.x + t.half + 1);
    for (let x = a; x <= b; x++) mask[x] = 1;
  }
  return mask;
}

/** A dirty-rect accumulator for the cells a weather pass touched. */
export class Touched {
  x0 = Infinity;
  y0 = Infinity;
  x1 = -1;
  y1 = -1;

  add(x: number, y: number): void {
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }

  flush(api: SimApi): void {
    if (this.x1 >= 0) api.grid.markDirty(this.x0, this.y0, this.x1, this.y1);
  }
}

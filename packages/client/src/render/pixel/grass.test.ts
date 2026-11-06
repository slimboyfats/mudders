import { describe, expect, it } from 'vitest';
import { grassMask } from './renderer';

describe('grassMask', () => {
  it('marks the round-start surface and one row either side, nothing deeper', () => {
    // 3 columns × 6 rows: column 0 ground from row 2, column 1 from row 4, column 2 empty
    const w = 3;
    const h = 6;
    const t = new Uint8Array(w * h);
    for (let y = 2; y < h; y++) t[y * w] = 1;
    for (let y = 4; y < h; y++) t[y * w + 1] = 1;
    const m = new Uint8Array(w * h);
    grassMask(t, w, h, m);
    const col = (x: number) => Array.from({ length: h }, (_, y) => m[y * w + x]);
    expect(col(0)).toEqual([0, 1, 1, 1, 0, 0]);
    expect(col(1)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(col(2)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('gives a floating ledge its own grass and clears stale marks', () => {
    const w = 1;
    const h = 8;
    const t = Uint8Array.from([0, 1, 0, 0, 0, 1, 1, 1]);
    const m = new Uint8Array(w * h).fill(1);
    grassMask(t, w, h, m);
    expect(Array.from(m)).toEqual([1, 1, 1, 0, 1, 1, 1, 0]);
  });
});

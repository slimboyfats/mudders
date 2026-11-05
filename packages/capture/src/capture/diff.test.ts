import { describe, expect, it } from 'vitest';
import { pixelDiff } from './diff';

const img = (vals: number[]) => ({
  width: vals.length / 3,
  height: 1,
  data: Uint8Array.from(vals),
});

describe('pixelDiff', () => {
  it('is 0 for identical images and ignores small noise', () => {
    expect(pixelDiff(img([1, 2, 3, 4, 5, 6]), img([1, 2, 3, 4, 5, 6]))).toBe(0);
    expect(pixelDiff(img([10, 10, 10]), img([30, 10, 10]))).toBe(0);
  });
  it('counts changed pixels and treats a size change as fully different', () => {
    expect(pixelDiff(img([0, 0, 0, 0, 0, 0]), img([0, 0, 0, 200, 0, 0]))).toBe(0.5);
    expect(pixelDiff(img([0, 0, 0]), img([0, 0, 0, 0, 0, 0]))).toBe(1);
  });
});

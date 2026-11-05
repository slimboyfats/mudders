import { describe, expect, it } from 'vitest';
import { FP, cellOf, cosDeci, isqrt, sinDeci, toFixed } from './fixed';

describe('fixed-point trig', () => {
  it('matches Math.sin to within one fixed-point unit over the circle', () => {
    for (let a = -3600; a <= 7200; a += 7) {
      const expected = Math.sin((a / 10) * (Math.PI / 180)) * FP;
      expect(Math.abs(sinDeci(a) - expected)).toBeLessThanOrEqual(1);
      expect(Math.abs(cosDeci(a) - Math.cos((a / 10) * (Math.PI / 180)) * FP)).toBeLessThanOrEqual(
        1,
      );
    }
  });

  it('hits exact values at the axes', () => {
    expect(sinDeci(0)).toBe(0);
    expect(sinDeci(900)).toBe(FP);
    expect(sinDeci(1800)).toBe(0);
    expect(sinDeci(2700)).toBe(-FP);
    expect(cosDeci(0)).toBe(FP);
  });
});

describe('isqrt', () => {
  it('is the exact floor square root', () => {
    for (let n = 0; n < 5000; n++) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
    expect(isqrt(2 ** 50)).toBe(2 ** 25);
    expect(isqrt(-4)).toBe(0);
  });
});

describe('conversions', () => {
  it('round-trips', () => {
    expect(toFixed(1.5)).toBe(FP + FP / 2);
    expect(cellOf(toFixed(3.99))).toBe(3);
    expect(cellOf(-1)).toBe(-1);
  });
});

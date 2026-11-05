import { FP, FP_SHIFT } from '@mudders/shared';

/**
 * Fixed-point helpers (§6.3). Decision for the milestone-1 open question: the sim is fixed-point.
 * Values are integers held in JS numbers and only `+ - * /`, `Math.trunc/floor/round` and
 * `Math.sqrt` (all correctly rounded by IEEE 754, so identical in every engine) are used. Trig comes
 * from a table built at load time with a Taylor series in basic arithmetic, never `Math.sin`.
 */

export { FP, FP_SHIFT };

/** Table resolution: 10 steps per degree. */
export const DECI = 10;
const QUARTER = 90 * DECI;

function taylorSin(x: number): number {
  // Horner form of x - x³/3! + x⁵/5! - … up to x¹⁹; error < 1e-15 on [0, π/2].
  const x2 = x * x;
  let term = 1;
  for (let n = 19; n >= 3; n -= 2) term = 1 - (x2 / (n * (n - 1))) * term;
  return x * term;
}

/** sin for 0..90° in deci-degrees, scaled by FP. */
const SIN_Q = new Int32Array(QUARTER + 1);
for (let i = 0; i <= QUARTER; i++)
  SIN_Q[i] = Math.round(taylorSin((i * Math.PI) / (180 * DECI)) * FP);

/** sin(angle) scaled by FP, angle in deci-degrees (any integer). */
export function sinDeci(angle: number): number {
  let a = angle % (360 * DECI);
  if (a < 0) a += 360 * DECI;
  if (a <= QUARTER) return SIN_Q[a]!;
  if (a <= 2 * QUARTER) return SIN_Q[2 * QUARTER - a]!;
  if (a <= 3 * QUARTER) return -SIN_Q[a - 2 * QUARTER]!;
  return -SIN_Q[4 * QUARTER - a]!;
}

export function cosDeci(angle: number): number {
  return sinDeci(angle + QUARTER);
}

/** Floor of the square root of a non-negative integer, exact for n < 2^52. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** Float from a manifest (data) → fixed-point integer. JSON parsing is deterministic. */
export function toFixed(v: number): number {
  return Math.round(v * FP);
}

/** Fixed-point → cell coordinate (floor). */
export function cellOf(v: number): number {
  return Math.floor(v / FP);
}

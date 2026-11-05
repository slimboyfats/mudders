/**
 * Visual regression (§2d `--diff`): fraction of pixels whose colour moved by more than `tolerance`
 * on any channel. Captures are byte-identical for identical inputs, so any difference is a real
 * change; the tolerance and threshold only absorb encoder noise.
 */
export function pixelDiff(
  a: { width: number; height: number; data: Uint8Array },
  b: { width: number; height: number; data: Uint8Array },
  tolerance = 24,
): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  const n = a.width * a.height;
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    if (
      Math.abs(a.data[o]! - b.data[o]!) > tolerance ||
      Math.abs(a.data[o + 1]! - b.data[o + 1]!) > tolerance ||
      Math.abs(a.data[o + 2]! - b.data[o + 2]!) > tolerance
    ) {
      changed++;
    }
  }
  return changed / n;
}

/** Fail when more than this fraction of pixels changed. */
export const DIFF_THRESHOLD = 0.002;

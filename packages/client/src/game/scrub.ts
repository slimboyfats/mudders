/**
 * Press-and-drag value scrubbing for the HUD (angle, power): pure maths so it can be unit-tested.
 *
 * Dragging along the main axis changes the value at `perPx` units per CSS pixel. Moving the
 * finger away from the control (perpendicular, past `fineAfterPx`) switches to fine mode, like
 * scrubbing a video on a phone: the further away, the slower, down to `fine` × the base rate.
 */
export interface ScrubSpec {
  min: number;
  max: number;
  /** Units per CSS px at full speed. */
  perPx: number;
  /** Off-axis distance (px) where fine mode starts. */
  fineAfterPx: number;
  /** Slowest rate as a fraction of `perPx`, reached at 3 × `fineAfterPx`. */
  fine: number;
}

export const ANGLE_SCRUB: ScrubSpec = { min: 0, max: 180, perPx: 0.4, fineAfterPx: 40, fine: 0.2 };
export const POWER_SCRUB: ScrubSpec = { min: 0, max: 1000, perPx: 2.5, fineAfterPx: 40, fine: 0.2 };

/** Rate multiplier (1 = full speed) for a finger `offAxisPx` away from where the drag started. */
export function scrubRate(spec: ScrubSpec, offAxisPx: number): number {
  const d = Math.abs(offAxisPx);
  if (d <= spec.fineAfterPx) return 1;
  const t = Math.min(1, (d - spec.fineAfterPx) / (2 * spec.fineAfterPx));
  return 1 - t * (1 - spec.fine);
}

/** Advance an unrounded value by a pointer move of `dxPx` along the main axis. */
export function scrubMove(spec: ScrubSpec, value: number, dxPx: number, offAxisPx: number): number {
  const v = value + dxPx * spec.perPx * scrubRate(spec, offAxisPx);
  return Math.max(spec.min, Math.min(spec.max, v));
}

/** The whole value the HUD sends. */
export function scrubValue(spec: ScrubSpec, raw: number): number {
  return Math.max(spec.min, Math.min(spec.max, Math.round(raw)));
}

/**
 * Hold-to-repeat on the nudge buttons: the step for the `n`th repeat (0 = the first press).
 * Small steps first, then bigger ones once the button has been held a while.
 */
export function nudgeStep(n: number, step: number, big: number): number {
  return n < 8 ? step : big;
}

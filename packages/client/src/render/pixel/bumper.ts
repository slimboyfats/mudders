import type { QuadBatch } from './batch';

/**
 * Pixel-art pinball bumper post (render-only, §2a) for the sim's `bumper` effect event: a round
 * striped cap on a steel stem pops up out of the ground, kicks (the cap jumps and flashes white)
 * when the sim throws the tanks, stands lit for a moment and sinks back. Every row is a hard
 * band snapped to map cells, no glow, and the look is a pure function of the event, so captures
 * replay exactly.
 */

export interface Post {
  x: number;
  /** Ground row under the post. */
  y: number;
  /** Render tick of the `bumper` event, and ticks until it kicks. */
  start: number;
  windup: number;
}

/** Cap rows, top down: half-width and colour, then the lit (kick) colour. */
const CAP: readonly (readonly [number, number, number])[] = [
  [4, 0xffd23c, 0xffffff],
  [6, 0xffd23c, 0xfff6c0],
  [7, 0xf4f0e8, 0xffffff],
  [8, 0xe0283c, 0xffe070],
  [8, 0xe0283c, 0xffffff],
  [7, 0xa01828, 0xffb040],
];
const STEM = 7;
const STEM_HW = 3;
const STEEL = 0x8a90a0;
const STEEL_DARK = 0x4a4f5e;
const STEEL_LIT = 0xc8ccd8;
const BASE = 0x3a3e4a;
/** Ticks it stands after the kick, and ticks it takes to sink back. */
const STAND = 46;
const SINK = 14;

export function makePost(x: number, y: number, start: number, windup: number): Post {
  return { x, y, start, windup };
}

/** Rows of post above the ground at render time `t`, plus the kick lift and the flash. */
function pose(p: Post, t: number): { rise: number; lift: number; lit: boolean } | undefined {
  const full = CAP.length + STEM;
  const age = t - p.start;
  if (age < 0) return undefined;
  const k = age - p.windup;
  if (k > STAND + SINK) return undefined;
  let rise: number;
  if (k < 0) {
    // pops up fast, with a one-row overshoot just before it kicks
    const u = Math.min(1, age / Math.max(1, p.windup - 2));
    rise = Math.round(full * u) + (k === -1 || k === -2 ? 1 : 0);
  } else if (k <= STAND) {
    rise = full;
  } else {
    rise = Math.round(full * (1 - (k - STAND) / SINK));
  }
  const lift = k >= 0 && k < 3 ? 3 : k >= 3 && k < 6 ? 1 : 0;
  // flashes on the kick, then blinks like a lit bumper while it stands
  const lit = (k >= 0 && k < 8) || (k >= 8 && k < STAND - 8 && ((k >> 2) & 3) === 0);
  return { rise, lift, lit };
}

/** Draw one post; returns false once it has sunk back into the ground. */
export function drawPost(p: Post, normal: QuadBatch, t: number): boolean {
  const ps = pose(p, Math.floor(t));
  if (!ps) return Math.floor(t) - p.start < 0;
  const { rise, lift, lit } = ps;
  const x = Math.round(p.x);
  const ground = Math.round(p.y);
  const stem = STEM + lift;
  // rows from the ground up; anything below the surface is hidden
  const total = CAP.length + stem;
  const top = ground - rise - lift;
  for (let i = 0; i < total; i++) {
    const row = top + i;
    if (row >= ground) break;
    if (i < CAP.length) {
      const [hw, col, hot] = CAP[i]!;
      normal.rect(x - hw, row, hw * 2 + 1, 1, lit ? hot : col);
      // a hard highlight on the upper left of the dome
      if (i >= 1 && i <= 3) normal.rect(x - hw + 2, row, 2, 1, 0xffffff, lit ? 1 : 0.85);
    } else {
      normal.rect(x - STEM_HW, row, STEM_HW * 2 + 1, 1, STEEL);
      normal.rect(x - STEM_HW, row, 1, 1, STEEL_DARK);
      normal.rect(x + STEM_HW, row, 1, 1, STEEL_DARK);
      normal.rect(x - 1, row, 1, 1, lit ? 0xffffff : STEEL_LIT);
    }
  }
  // a dark collar where it comes out of the ground
  if (rise > 0) normal.rect(x - STEM_HW - 2, ground - 1, STEM_HW * 2 + 5, 1, BASE);
  return true;
}

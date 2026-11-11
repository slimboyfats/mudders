import { Shape, type QuadBatch } from './batch';

/**
 * Pixel-art Upfall column (render-only, §2a) for the sim's per-tick `upfall` events: two hard
 * dashed walls of violet-cyan light that climb from the ground to the top of the column while it
 * opens, motes of light streaming upwards between them, and a wobbling seam at the top where
 * everything torn up hangs. All on whole map cells in hard colour steps, no smooth glow, and a pure
 * function of the event stream, so captures replay exactly. The debris itself is the sim's.
 */

export interface UpfallFx {
  x: number;
  ground: number;
  half: number;
  top: number;
  /** Sim ticks since it opened (from the event). */
  age: number;
  /** Lifting (gravity flipped) rather than still opening. */
  on: boolean;
  /** Ticks left before it lets go. */
  left: number;
  /** Render tick of the latest event. */
  last: number;
}

/** Hot to deep: white, cyan, sky blue, violet, deep violet. */
const RAMP = [0xffffff, 0x9af6ff, 0x5ab8ff, 0x9a6cff, 0x5a3cc0] as const;
const MOTES = 70;

function px(b: QuadBatch, x: number, y: number, color: number, alpha: number): void {
  b.push(x + 0.5, y + 0.5, 1, 1, color, alpha, Shape.Rect);
}

/** A cheap integer hash for per-mote constants. */
function hash(k: number): number {
  let h = Math.imul(k ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  return (h ^ (h >>> 13)) >>> 0;
}

export function drawUpfall(f: UpfallFx, additive: QuadBatch, t: number): void {
  const height = Math.max(1, f.ground - f.top);
  // the walls climb from the ground while it opens, then stand; they flicker as it runs out
  const grow = f.on ? 1 : Math.min(1, f.age / 40);
  const reach = Math.round(height * grow);
  const ending = f.on && f.left < 30;
  if (ending && (t & 3) === 0) return;
  const fade = f.on ? 1 : 0.6 + 0.4 * grow;
  const scroll = f.age;
  for (const side of [-1, 1]) {
    const x = f.x + side * (f.half + 1);
    for (let k = 0; k < reach; k++) {
      const y = f.ground - k;
      const ph = (k + scroll * 2) & 15;
      if (ph > 9) continue;
      const band = ph < 2 ? 0 : ph < 5 ? 1 : ph < 8 ? 2 : 3;
      px(additive, x, y, RAMP[band]!, 0.55 * fade);
      // a second, dimmer wall a cell inside for weight
      if (band < 2) px(additive, x - side, y, RAMP[3]!, 0.35 * fade);
    }
  }
  if (!f.on) {
    // the opening: a seam of light running along the ground
    const w = Math.round(f.half * grow);
    for (let dx = -w; dx <= w; dx++) {
      if (((dx + scroll) & 3) === 0) continue;
      px(additive, f.x + dx, f.ground - 1, RAMP[(dx + scroll) & 1 ? 1 : 2]!, 0.5);
    }
    return;
  }
  // motes streaming up: each one a bright head and a short dim tail below it
  for (let k = 0; k < MOTES; k++) {
    const h = hash(k + 17);
    const mx = f.x - f.half + (h % (2 * f.half + 1));
    const speed = 1 + ((h >>> 8) & 3) * 0.5;
    const y = f.ground - Math.floor((f.age * speed + ((h >>> 12) % height)) % height);
    const hot = (h >>> 20) & 3;
    px(additive, mx, y, RAMP[hot === 0 ? 0 : 1]!, 0.7);
    px(additive, mx, y + 1, RAMP[2]!, 0.45);
    if (speed > 1.5) px(additive, mx, y + 2, RAMP[3]!, 0.3);
  }
  // the seam at the top where it all hangs: a wobbling dashed line
  for (let dx = -f.half; dx <= f.half; dx++) {
    if (((dx + (scroll >> 1)) & 3) === 3) continue;
    const wob = ((dx + (scroll >> 2)) & 7) < 4 ? 0 : 1;
    px(additive, f.x + dx, f.top - 2 + wob, RAMP[((dx >> 2) + (scroll >> 3)) & 1 ? 3 : 4]!, 0.45);
  }
}

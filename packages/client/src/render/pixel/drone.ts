import { Shape, type QuadBatch } from './batch';

/**
 * Pixel-art Repair Drone (render-only, §2a) for the sim's per-tick `drone` effect events: a small
 * white-and-green quadcopter body with two flickering rotor bars, a blinking beacon, and while it
 * hovers over its tank a dashed green mending beam crawling down to the hull. Everything sits on
 * whole map cells in hard colours, no smooth glow, and the look is a pure function of the event
 * stream, so captures replay exactly.
 */

export interface DroneFx {
  /** Sim id (spawn tick) the events carry. */
  id: number;
  x: number;
  y: number;
  /** Where it was one event ago, for the tilt. */
  px: number;
  /** Hovering over its tank (beam on). */
  hover: boolean;
  /** Its tank's hull top, for the beam. */
  beamTo: number;
  /** Ticks since a heal pulse (big sparkle), or a large number. */
  pulse: number;
  /** Render tick of the latest event. */
  last: number;
  /** Render tick it appeared. */
  born: number;
}

const BODY = 0xe8ecef;
const BODY_DARK = 0x8a949c;
const TRIM = 0x3ccf6a;
const ROTOR = 0xc8d0d8;
const ROTOR_DIM = 0x6a7480;
const BEACON_ON = 0x50ff80;
const BEACON_OFF = 0x1e5a32;
const BEAM = [0x9affb8, 0x50e080, 0x2a9c50] as const;
const CROSS = 0xffffff;

function px(b: QuadBatch, x: number, y: number, color: number, alpha = 1): void {
  b.push(Math.round(x) + 0.5, Math.round(y) + 0.5, 1, 1, color, alpha, Shape.Rect);
}

function rect(b: QuadBatch, x0: number, y0: number, w: number, h: number, color: number): void {
  b.push(x0 + w / 2, y0 + h / 2, w, h, color, 1, Shape.Rect);
}

/** Draw one drone (and its mending beam) at render time `t`. */
export function drawDrone(d: DroneFx, normal: QuadBatch, additive: QuadBatch, t: number): void {
  const age = t - d.born;
  // a gentle one-cell bob while it hovers
  const bob = d.hover ? (Math.floor(age / 10) % 2 === 0 ? 0 : 1) : 0;
  const cx = Math.round(d.x);
  const cy = Math.round(d.y) + bob;
  const lean = d.x > d.px + 0.2 ? 1 : d.x < d.px - 0.2 ? -1 : 0;

  if (d.hover) {
    // dashed beam crawling down to the hull, with a little plus at the bottom
    const top = cy + 3;
    const bottom = Math.round(d.beamTo) - 1;
    for (let y = top; y <= bottom; y++) {
      const ph = (y - top - Math.floor(age / 2)) & 3;
      if (ph === 3) continue;
      const col = BEAM[ph]!;
      px(normal, cx, y, col);
      if (ph === 0) px(additive, cx, y, col, 0.5);
    }
    const blink = Math.floor(age / 6) % 2 === 0;
    if (blink && bottom > top) {
      px(normal, cx, bottom - 1, CROSS);
      px(normal, cx - 1, bottom, CROSS);
      px(normal, cx + 1, bottom, CROSS);
    }
  }
  if (d.pulse < 24) {
    // a heal pulse: a hard-edged ring of green pixels opening out from the hull
    const r = 3 + Math.floor(d.pulse / 3);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      px(additive, d.x + Math.cos(a) * r, d.beamTo + Math.sin(a) * r * 0.6, BEAM[i % 3]!, 0.9);
    }
  }

  // body: a 5×3 shell with a green stripe, two arms out to the rotors
  rect(normal, cx - 2, cy - 1, 5, 3, BODY);
  rect(normal, cx - 2, cy + 1, 5, 1, BODY_DARK);
  rect(normal, cx - 2 + (lean > 0 ? 1 : 0), cy, 4, 1, TRIM);
  rect(normal, cx - 5, cy - 1, 3, 1, BODY_DARK);
  rect(normal, cx + 3, cy - 1, 3, 1, BODY_DARK);
  // rotors: bars that flicker between long and short as the blades spin
  const spin = age & 1;
  for (const side of [-1, 1]) {
    const rx = cx + side * 5;
    const ry = cy - 2 - (lean === side ? 0 : lean === -side ? 1 : 0);
    if (spin === 0) {
      rect(normal, rx - 2, ry, 5, 1, ROTOR);
    } else {
      rect(normal, rx - 1, ry, 3, 1, ROTOR_DIM);
    }
  }
  // skid legs
  px(normal, cx - 2, cy + 2, BODY_DARK);
  px(normal, cx + 2, cy + 2, BODY_DARK);
  // beacon
  const lit = Math.floor(age / 8) % 2 === 0;
  px(normal, cx, cy - 2, lit ? BEACON_ON : BEACON_OFF);
  if (lit) px(additive, cx, cy - 3, BEACON_ON, 0.6);
}

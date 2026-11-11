import { Shape, type QuadBatch } from './batch';

/**
 * Pixel-art Cloud Whale (render-only, §2a) for the sim's per-tick `whale` events. The whale is
 * drawn cell by cell from a shape in its own body coordinates (an ellipse of a head and body, a
 * tapering tail stock, two flukes that beat up and down, a flapping flipper), turned to its pitch
 * by sampling each map cell back into the body, so it stays crisp on the grid at any angle. Hard
 * colour bands top to belly, throat grooves, a dark outline, and a slow dithered boil across the
 * cloud. A pure function of the event stream and the render tick, so captures replay exactly.
 */

export interface WhaleFx {
  x: number;
  y: number;
  dir: number;
  /** Nose-down pitch, radians. */
  pitch: number;
  /** Sim age of the op (beats its tail). */
  age: number;
  diving: boolean;
  /** How far it has condensed out of the shell, 0 → 1 (1 = whole). */
  appear: number;
  /** Render tick of the latest event. */
  last: number;
}

/** Half the whale's length, cells; the drawing box is a little bigger. */
export const WHALE_HALF = 50;
const BOX = 58;

const OUTLINE = 0x3e4c70;
const TOP = 0xffffff;
const UPPER = 0xe8eef8;
const SIDE = 0xc8d4e6;
const LOW = 0xa6b6d2;
const BELLY = 0x86a6d6;
const GROOVE = 0x5c7cb6;
const EYE = 0x141a2a;
const FLIPPER = 0x9aaccc;

function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x5bd1e995);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
}

/**
 * What the whale is at body point (bx, by), x towards the head, y down: 0 outside, 1 body,
 * 2 flipper.
 */
function partAt(bx: number, by: number, beat: number, fin: number, c: number, s: number): number {
  // head and body: one big ellipse, a little flatter on the belly side
  const ex = (bx - 14) / 36;
  const ey = by / (by < 0 ? 16 : 14);
  if (ex * ex + ey * ey <= 1) return 1;
  // tail stock: tapering from the body to the flukes, bending with the beat
  if (bx < -14 && bx >= -44) {
    const k = (-14 - bx) / 30;
    const bend = beat * k * k * 6;
    const half = 12 - 9 * k;
    if (Math.abs(by - bend - 1 + k * 2) <= half) return 1;
  }
  // flukes: two swept lobes at the end of the stock
  if (bx < -38 && bx >= -58) {
    const k = (-38 - bx) / 20;
    const bend = beat * 6 + beat * k * 4;
    const reach = 4 + 14 * k;
    const thick = 4.5 - 3.5 * k;
    const y = by - bend + 1;
    if (Math.abs(Math.abs(y) - reach * 0.9) <= thick && Math.abs(y) <= reach + 1) return 1;
    if (k < 0.35 && Math.abs(y) <= 4) return 1;
  }
  // a flipper hanging back from under the front, flapping
  const fx = bx - 18;
  const fy = by - 13 - fin * 2;
  const u = fx * c + fy * s;
  const v = -fx * s + fy * c;
  if (u < 0 && u > -18 && Math.abs(v) <= 3 * (1 + u / 18) + 0.6) return 2;
  return 0;
}

function px(b: QuadBatch, x: number, y: number, color: number): void {
  b.push(x + 0.5, y + 0.5, 1, 1, color, 1, Shape.Rect);
}

/** Draw one whale at render time `t`. */
/** Eases past 1 and settles back (a little overshoot as it swells to full size). */
function easeOutBack(k: number): number {
  const c = 1.9;
  const m = k - 1;
  return 1 + (c + 1) * m * m * m + c * m * m;
}

export function drawWhale(w: WhaleFx, normal: QuadBatch, t: number, additive?: QuadBatch): void {
  // condensing out of the shell: it swells up from a knot of cloud, its cells filling in from the
  // middle out with a bright seam of fresh vapour at the edge of what has formed so far
  const ap = Math.max(0, Math.min(1, w.appear));
  const forming = ap < 1;
  const scale = forming ? 0.12 + 0.88 * easeOutBack(ap) : 1;
  const fill = ap * 1.7;
  const beat = Math.sin(w.age * (w.diving ? 0.32 : forming ? 0.45 : 0.16));
  const fin = Math.sin(w.age * 0.11 + 1);
  const cx = Math.round(w.x);
  const cy = Math.round(w.y);
  // map cell → body: undo the pitch (mirrored when it swims left)
  const a = w.pitch * w.dir;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const boil = t >> 3;
  const fc = Math.cos(0.5 + fin * 0.25);
  const fs = Math.sin(0.5 + fin * 0.25);
  const toBody = (dx: number, dy: number): [number, number] => [
    ((dx * c + dy * s) * w.dir) / scale,
    (-dx * s + dy * c) / scale,
  ];
  for (let dy = -BOX; dy <= BOX; dy++) {
    for (let dx = -BOX; dx <= BOX; dx++) {
      const [bx, by] = toBody(dx, dy);
      if (bx < -60 || bx > 52 || by < -30 || by > 34) continue;
      const part = partAt(bx, by, beat, fin, fc, fs);
      if (part === 0) continue;
      if (forming) {
        // each cell condenses at its own moment, the middle first
        const r = Math.min(1, Math.hypot(bx - 6, by * 2) / 60);
        const at = (hash(Math.round(bx), Math.round(by), 7) & 255) / 255 + r;
        if (at > fill) continue;
        if (at > fill - 0.18) {
          // fresh vapour: a white or pale cyan cell, lit
          const col = (hash(Math.round(bx), Math.round(by), t) & 1) === 0 ? 0xffffff : 0xbff4ff;
          px(normal, cx + dx, cy + dy, col);
          if (additive)
            additive.push(cx + dx + 0.5, cy + dy + 0.5, 1, 1, 0x9ad0ff, 0.5, Shape.Rect);
          continue;
        }
      }
      // outline where a neighbour is outside
      let edge = false;
      for (let k = 0; k < 4 && !edge; k++) {
        const ox = k === 0 ? 1 : k === 1 ? -1 : 0;
        const oy = k === 2 ? 1 : k === 3 ? -1 : 0;
        const [nx, ny] = toBody(dx + ox, dy + oy);
        const n = partAt(nx, ny, beat, fin, fc, fs);
        edge = n === 0 || (part === 2 && n === 1);
      }
      let col: number;
      if (edge) col = OUTLINE;
      else if (part === 2) col = FLIPPER;
      else {
        // bands from the white back to the blue belly, the belly line rising towards the tail
        const belly = 5 - Math.max(0, -bx) * 0.12;
        const front = bx > -6;
        if (by >= belly) {
          col = BELLY;
          // throat grooves: hard stripes along the front of the belly
          if (front && by > belly + 1 && Math.round(by) % 3 === 0) col = GROOVE;
        } else if (by < -10) col = TOP;
        else if (by < -3) col = UPPER;
        else if (by < 2) col = SIDE;
        else col = LOW;
        // the cloud boils: single cells flick a band lighter or darker
        const h = hash(Math.round(bx), Math.round(by), boil) & 31;
        if (h === 0) col = col === BELLY ? LOW : TOP;
        else if (h === 1) col = col === TOP ? UPPER : col === BELLY ? GROOVE : LOW;
        // its eye, and the line of its mouth
        if (Math.abs(bx - 40) < 1.6 && Math.abs(by - 1.5) < 1.6) col = EYE;
        if (bx > 28 && bx < 49 && Math.abs(by - (4.5 - (bx - 28) * 0.08)) < 0.55) col = OUTLINE;
      }
      px(normal, cx + dx, cy + dy, col);
    }
  }
}

/** The map point of a body point (for spouts and wisps). */
export function whalePoint(w: WhaleFx, bx: number, by: number): [number, number] {
  const a = w.pitch * w.dir;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = bx * w.dir;
  return [w.x + x * c - by * s, w.y + x * s + by * c];
}

/**
 * Portal Pair rings (terrainop.portal): two upright ovals standing on the ground, a cyan one where
 * the shell landed and a violet one by the shooter. A thick stepped rim with bright bands running
 * round it, and a dark mouth with motes spiralling into the middle. Whole map cells, no glow. The
 * sim sends one `portal` event a tick; this keeps no state beyond the latest one.
 */
import type { QuadBatch } from './batch';

export interface PortalFx {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  rx: number;
  ry: number;
  age: number;
  open: number;
  /** Ticks since it started to shut, or -1 while open. */
  shut: number;
  close: number;
  /** Turns left (shown by the rim's bands thinning out). */
  left: number;
  last: number;
}

/** Rim colours, dark to hot: the far ring (where the shell landed) and the near ring. */
export const RING_A = [0x1a3c9a, 0x2a7cff, 0x40e0ff, 0x9ff0ff, 0xffffff] as const;
export const RING_B = [0x4a1a8a, 0x7a2cd0, 0xc060ff, 0xff8af0, 0xffffff] as const;
const MOUTH = 0x0c0820;

function hash(a: number, b: number, c: number): number {
  let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (c * 83492791), 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  return ((h ^ (h >>> 13)) & 0xffff) / 0x10000;
}

/** How open the rings are now, 0..1 (they swirl open from a slit and squeeze shut). */
export function portalOpenness(p: PortalFx, t: number): number {
  const age = p.age + Math.max(0, t - p.last);
  const k =
    p.shut >= 0
      ? 1 - (p.shut + Math.max(0, t - p.last)) / Math.max(1, p.close)
      : age / Math.max(1, p.open);
  // stepped, so it opens in visible hops
  return Math.max(0, Math.min(1, Math.floor(k * 8) / 8));
}

function drawRing(
  b: QuadBatch,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  open: number,
  pal: readonly number[],
  t: number,
  salt: number,
): void {
  if (open <= 0) return;
  // it opens as a slit that widens: full height first, then width
  const h = Math.max(2, Math.round(ry * Math.min(1, open * 1.6)));
  const w = Math.max(1, Math.round(rx * Math.max(0.12, open)));
  const tf = Math.floor(t);
  // the mouth: dark, with motes spiralling in
  for (let y = -h + 1; y < h; y++) {
    const span = Math.floor(w * Math.sqrt(Math.max(0, 1 - (y * y) / (h * h)))) - 1;
    if (span <= 0) continue;
    b.rect(cx - span, cy + y, span * 2 + 1, 1, MOUTH, 0.9);
  }
  const motes = Math.round(10 * open);
  for (let i = 0; i < motes; i++) {
    const f = 1 - ((hash(i, salt, 1) + tf * 0.02) % 1);
    const a = hash(i, salt, 2) * Math.PI * 2 + tf * 0.12 * (1.5 - f);
    const mx = Math.round(cx + Math.cos(a) * (w - 2) * f);
    const my = Math.round(cy + Math.sin(a) * (h - 2) * f);
    b.rect(mx, my, 1, 1, pal[f > 0.6 ? 1 : 2]!);
  }
  // the rim: two cells thick, bright bands chasing round it
  const n = Math.max(24, Math.round((w + h) * 4));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const band = Math.floor(i / (n / 12) + tf * 0.35) % 4;
    const lvl = band === 0 ? 4 : band === 1 ? 3 : 2;
    const ox = Math.round(cx + ca * w);
    const oy = Math.round(cy + sa * h);
    b.rect(ox, oy, 1, 1, pal[lvl]!);
    b.rect(Math.round(cx + ca * (w - 1)), Math.round(cy + sa * (h - 1)), 1, 1, pal[lvl - 1]!);
    // a ragged outer fringe that flickers
    if (hash(i, tf >> 1, salt) < 0.18) {
      b.rect(Math.round(cx + ca * (w + 1)), Math.round(cy + sa * (h + 1)), 1, 1, pal[1]!);
    }
  }
}

export function drawPortal(b: QuadBatch, p: PortalFx, t: number): void {
  const open = portalOpenness(p, t);
  drawRing(b, p.ax, p.ay, p.rx, p.ry, open, RING_A, t, 1);
  drawRing(b, p.bx, p.by, p.rx, p.ry, open, RING_B, t, 2);
}

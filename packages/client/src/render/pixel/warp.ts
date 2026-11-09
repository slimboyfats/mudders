/**
 * Warp (terrainop.warp: Teleport Shell, Swap Ray): a tank breaks apart into its own pixels, which
 * lift off and burn out white → cyan → violet; a comet of pixels streaks along an arc to where it
 * comes out; there its pixels fly in from all round and snap back into the sprite. Everything is
 * whole map cells (no glow), driven by the sim's `warpOut` / `warpIn` ticks.
 */
import type { QuadBatch } from './batch';

/** One tank's warp, from its `warpOut` and `warpIn` events (centre of the hull at each end). */
export interface WarpFx {
  out: number;
  outDur: number;
  /** Tick it came out, or -1 while it is still on the way. */
  in: number;
  inDur: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

/** Hot to cool, the colours a loose pixel steps through. */
const HOT = [0xffffff, 0xc8f4ff, 0x40e0ff, 0x4a8cff, 0x8a5cff, 0x5a2cc0] as const;
/** Share of the break-up (and of the pull-together) over which pixels start to move. */
const SPREAD = 0.65;

/** A stable 0..1 hash per sprite cell, player and salt. */
function hash(r: number, c: number, p: number, salt: number): number {
  let h = Math.imul(r * 31 + c * 977 + p * 7919 + salt * 104729, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h & 0xffff) / 0x10000;
}

function hot(u: number): number {
  return HOT[Math.max(0, Math.min(HOT.length - 1, Math.floor(u * HOT.length)))]!;
}

/** Is a warp still playing at tick t (false once the tank has pulled itself together)? */
export function warpLive(w: WarpFx, t: number): boolean {
  return w.in < 0 ? t - w.out < w.outDur + 600 : t - w.in < w.inDur;
}

/**
 * Draw a warping tank instead of its sprite (x, y: the tank's bottom centre now). `color(code)` is
 * the sprite cell's normal colour. Returns false once the warp is over and the tank draws normally.
 */
export function drawWarp(
  b: QuadBatch,
  w: WarpFx,
  rows: readonly string[],
  x: number,
  y: number,
  player: number,
  t: number,
  color: (code: number) => number,
): boolean {
  if (!warpLive(w, t)) return false;
  const sw = rows[0]?.length ?? 0;
  const sh = rows.length;
  const x0 = x - (sw >> 1);
  const y0 = y - sh;
  const coming = w.in >= 0 && t >= w.in;
  const k = coming ? (t - w.in) / w.inDur : (t - w.out) / w.outDur;
  // stepped time: pixels move in whole-tick hops
  const kk = Math.floor(k * 16) / 16;
  for (let r = 0; r < sh; r++) {
    const row = rows[r]!;
    for (let c = 0; c < sw; c++) {
      const code = row.charCodeAt(c);
      if (code === 46) continue;
      const h = hash(r, c, player, 1);
      const sx = (hash(r, c, player, 2) - 0.5) * 2;
      const sy = hash(r, c, player, 3);
      if (!coming) {
        // breaking apart: each pixel lets go at its own moment and drifts up, burning out
        const u = (kk - h * SPREAD) / (1 - SPREAD);
        if (u < 0) {
          // about to go: it flickers white first
          const near = u > -0.25 && ((t + r + c) & 1) === 0;
          b.rect(x0 + c, y0 + r, 1, 1, near ? 0xffffff : color(code));
          continue;
        }
        if (u >= 1) continue;
        const px = x0 + c + Math.round(sx * u * 9);
        const py = y0 + r - Math.round((2 + sy * 10) * u * (0.5 + u));
        b.rect(px, py, 1, 1, hot(u));
      } else {
        // pulling together: pixels fly in from a scatter round the spot and snap into place
        const u = (kk - h * SPREAD) / (1 - SPREAD);
        if (u < 0) continue;
        if (u >= 1) {
          const settle = kk < 1 && u < 1.4 && ((t + c) & 3) === 0;
          b.rect(x0 + c, y0 + r, 1, 1, settle ? 0xc8f4ff : color(code));
          continue;
        }
        const v = 1 - u;
        const px = x0 + c + Math.round(sx * v * v * 22);
        const py = y0 + r + Math.round((sy - 0.65) * v * v * 26);
        b.rect(px, py, 1, 1, hot(v * 0.99));
      }
    }
  }
  drawComet(b, w, player, t);
  return true;
}

/** The comet of pixels that carries a tank from where it broke up to where it comes out. */
function drawComet(b: QuadBatch, w: WarpFx, player: number, t: number): void {
  const start = w.out + w.outDur * 0.45;
  const travel = w.outDur * 0.55 + w.inDur * 0.45;
  const dx = w.tx - w.fx;
  const dy = w.ty - w.fy;
  const dist = Math.hypot(dx, dy);
  const lift = Math.min(90, 12 + dist * 0.18);
  const at = (s: number): [number, number] => [
    Math.round(w.fx + dx * s),
    Math.round(w.fy + dy * s - lift * 4 * s * (1 - s)),
  ];
  const s0 = (t - start) / travel;
  if (s0 < 0 || s0 > 1.6) return;
  // one sample per cell of the path, back along the tail
  const ds = 1 / Math.max(8, dist + lift);
  const L = Math.round(Math.min(110, 20 + dist * 0.4));
  const tf = Math.floor(t);
  for (let i = L - 1; i >= 0; i--) {
    const s = s0 - i * ds;
    if (s < 0 || s > 1) continue;
    const [px, py] = at(s);
    const u = i / L;
    if (i < 3) {
      // the head: a hard white core with a cyan rim
      b.rect(px - 1, py - 1, 3, 3, 0x40e0ff);
      b.rect(px, py, 1, 1, 0xffffff);
      continue;
    }
    // a ragged tail: thick and hot near the head, thinning into scattered violet pixels
    const j = hash(i, tf, player, 4);
    if (j < u * 0.75) continue;
    const ox = Math.round((hash(i, tf, player, 5) - 0.5) * 5 * u);
    const oy = Math.round((hash(i, tf, player, 6) - 0.5) * 5 * u);
    const wide = u < 0.3 ? 2 : 1;
    b.rect(px + ox, py + oy, wide, wide, hot(u * 0.6 + 0.12));
  }
}

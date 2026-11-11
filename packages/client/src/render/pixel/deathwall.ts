import { Shape, type QuadBatch } from './batch';

/**
 * The loose bits on the sudden-death wall (§3.1): green motes rising through it, wisps torn off
 * its face and green lightning deep inside. The wall's body (and how it swallows shells) is
 * `wall.ts`; these are stateless, a pure function of their index and the render time.
 *
 * Coordinates: `u` is the distance in cells from a side's map edge toward the middle; the wall's
 * face stands at u = zone (the map edge itself before sudden death) and the wall fills everything
 * from there outward, past the map edge to the edge of the screen.
 */

const WISP = [0x2a352b, 0x34402f, 0x3d4a36] as const;
const BOLT = 0x7cf2a0;
const BOLT_HALO = 0x2f8a52;

/** Integer hash → [0, 1). */
function h01(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 11, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

const WISPS_PER_100 = 70;
/** Lattice the motes sit on (cells). */
const DEEP_TILE = 9;
/** Rows per green mote column cell. */
const MOTE_TILE = 26;

export interface WallView {
  /** Map size in cells. */
  width: number;
  height: number;
  /** Visible map rect (cells), may reach past the map. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Draw the wall with its face `zone` cells in from each side (fractional while it creeps), at
 * render time `t` (ticks). `fresh` (0…1) tints the face toxic just after the zone moved in.
 */
export function drawDeathWall(
  normal: QuadBatch,
  zone: number,
  t: number,
  v: WallView,
  fresh: number,
): void {
  for (let side = 0; side < 2; side++) {
    const left = side === 0;
    // the screen's outermost cell on this side, as u
    const uOut = Math.floor(left ? v.x0 : v.width - v.x1) - 2;
    if (uOut >= zone + 8) continue; // the wall is off screen
    const toX = (u: number) => (left ? u : v.width - u);
    const top = Math.floor(v.y0) - 6;
    const span = Math.ceil(v.y1 - v.y0) + 12;

    // the body itself is painted by the wall shader (wall.ts); these are the loose bits on top
    const i1 = Math.floor((zone - 4) / DEEP_TILE);
    const i0 = Math.max(Math.floor(uOut / DEEP_TILE) - 1, i1 - 60);

    // motes: green specks rising slowly through the dark and winking out
    for (let i = i0; i <= i1; i += 1) {
      for (let j = Math.floor(v.y0 / MOTE_TILE) - 1; j <= Math.ceil(v.y1 / MOTE_TILE); j++) {
        const n = (i + 4096) * 8192 + (j + 4096);
        const life = 180 + h01(n, 61) * 240;
        const p = mod(t / life + h01(n, 62 + side), 1);
        const u = i * DEEP_TILE + h01(n, 63) * DEEP_TILE;
        if (u > zone - 3) continue;
        const y = j * MOTE_TILE + h01(n, 64) * MOTE_TILE - p * 18;
        const blink = Math.sin(p * Math.PI);
        if (blink < 0.25) continue;
        normal.push(
          Math.round(toX(u)),
          Math.round(y),
          1,
          1,
          p > 0.5 ? BOLT_HALO : BOLT,
          0.7 * blink,
        );
      }
    }

    // wisps: small tendrils torn off the face, drifting out over the battlefield and fading
    const salt = side * 7919;
    const wn = Math.ceil((span / 100) * WISPS_PER_100);
    for (let i = 0; i < wn; i++) {
      const life = 120 + h01(i, 11 + salt) * 160;
      const p = mod(t / life + h01(i, 12 + salt), 1);
      const y0 = top + h01(i, 13 + salt) * span;
      const u = zone + 1 + p * (6 + h01(i, 14 + salt) * 14);
      const y = y0 + Math.sin(p * 5 + i) * 2 - p * 4;
      const size = Math.round(2 + h01(i, 15 + salt) * 3);
      const alpha = (1 - p) * 0.45;
      let col: number = WISP[i % WISP.length]!;
      if (fresh > 0 && i % 3 === 0) col = BOLT_HALO;
      normal.push(
        Math.round(toX(u)),
        Math.round(mod(y - top, span) + top),
        size,
        size,
        col,
        alpha,
        Shape.Stipple,
      );
    }

    // green lightning deep in the wall: now and then a jagged bolt crackles down for a few frames
    const slot = Math.floor(t / 6);
    if (h01(slot, 30 + side) > 0.82) {
      const depth = 14 + h01(slot, 31 + side) * Math.max(10, zone - uOut - 14);
      const ub = zone - depth;
      if (ub > uOut) {
        let x = toX(ub);
        let y = top + h01(slot, 32 + side) * span * 0.7;
        const segs = 6 + Math.floor(h01(slot, 33 + side) * 8);
        for (let s = 0; s < segs; s++) {
          const nx = x + (h01(slot * 31 + s, 34 + side) - 0.5) * 8;
          const ny = y + 3 + h01(slot * 31 + s, 35 + side) * 6;
          normal.line(
            Math.round(x),
            Math.round(y),
            Math.round(nx),
            Math.round(ny),
            3,
            BOLT_HALO,
            0.35,
          );
          normal.line(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), 1, BOLT, 0.95);
          x = nx;
          y = ny;
        }
      }
    }
  }
}

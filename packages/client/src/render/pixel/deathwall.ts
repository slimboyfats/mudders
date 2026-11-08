import { Shape, type QuadBatch } from './batch';

/**
 * The sudden-death wall (§3.1), built from particles: a towering bank of dark fallout at the
 * battlefield's left and right edges, full height of the screen. Purely cosmetic and stateless:
 * every puff is a pure function of its index and the render time, snapped to whole map cells and
 * drawn as dithered pixel blobs, after everything else in the world so smoke and sparks never
 * show through it.
 *
 * Coordinates: `u` is the distance in cells from a side's map edge toward the middle; the wall's
 * face stands at u = zone (the map edge itself before sudden death) and the wall fills everything
 * from there outward, past the map edge to the edge of the screen.
 */

/** Dark fallout shades, darkest first. */
const BODY = [0x070a08, 0x0b100c, 0x101712, 0x172019, 0x1f2a21] as const;
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

/** Puffs per side for every 100 rows of screen height. */
const PUFFS_PER_100 = 260;
const WISPS_PER_100 = 70;
/** How deep behind the face the churning puffs reach; deeper is the solid body. */
const CHURN = 40;

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

    // the body right behind the face: hard bands of darkness, thickest furthest out; the
    // churning puffs on top hide the band edges
    const bodyIn = zone - 3;
    if (bodyIn > uOut) {
      const bands = [0.5, 0.68, 0.8, 0.88] as const;
      const step = Math.min(14, (bodyIn - uOut) / bands.length);
      for (let b = 0; b < bands.length; b++) {
        const ua = b === bands.length - 1 ? uOut : bodyIn - step * (b + 1);
        const ub = bodyIn - step * b;
        const xa = Math.round(Math.min(toX(ua), toX(ub)));
        const xb = Math.round(Math.max(toX(ua), toX(ub)));
        normal.rect(xa, top, Math.max(1, xb - xa), span, BODY[0], bands[b]!);
      }
    }

    // churning puffs: pour slowly down the wall in tall sheets, swell and fade, the ones at the
    // face billowing out toward the battlefield and falling back
    const n = Math.ceil((span / 100) * PUFFS_PER_100);
    const salt = side * 7919;
    for (let i = 0; i < n; i++) {
      const hd = h01(i, 1 + salt);
      const hy = h01(i, 2 + salt);
      const hs = h01(i, 3 + salt);
      const hp = h01(i, 4 + salt);
      const hc = h01(i, 5 + salt);
      const life = 160 + hs * 220;
      const p = mod(t / life + hp, 1);
      // most puffs near the face, a thinning tail deep into the body
      const depth = hd * hd * CHURN * 1.6;
      const billow = depth < 10 ? Math.sin((p + hc) * Math.PI * 2) * (10 - depth) * 0.45 : 0;
      const u = zone - depth + billow + 1;
      if (u < uOut - 6) continue;
      const fall = 0.035 + hs * 0.05;
      const y = top + mod(hy * span + t * fall, span);
      const size = Math.round(6 + hs * 10 + p * 6);
      const alpha = Math.sin(p * Math.PI) * (depth < 6 ? 0.55 : 0.8);
      if (alpha < 0.06) continue;
      const shade =
        BODY[Math.min(BODY.length - 1, Math.floor(hc * BODY.length * (1 - depth / CHURN) + 0.6))]!;
      normal.push(Math.round(toX(u)), Math.round(y), size, size, shade, alpha, Shape.Pixel);
    }

    // wisps: small tendrils torn off the face, drifting out over the battlefield and fading
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
        Shape.Pixel,
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

    // just after the wall moved in, its face glows faintly toxic
    if (fresh > 0.05) {
      const x = Math.round(toX(zone + 1));
      for (let y = top; y < top + span; y += 6) {
        if (h01(Math.floor(y / 6), 40 + side + Math.floor(t / 8)) < 0.5) continue;
        normal.push(x, y, 5, 5, BOLT_HALO, 0.3 * fresh, Shape.Pixel);
      }
    }
  }
}

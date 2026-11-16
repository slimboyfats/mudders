import type { TankView } from '@mudders/shared';
import type { QuadBatch } from './batch';

/** Stain bits for `stainBits` / `stainTint` (§4b tank stains). */
export const STAIN_WET = 1;
export const STAIN_OILED = 2;
export const STAIN_MUDDY = 4;
export const STAIN_BURNING = 8;

const WET_RGB = 0x2f6fc0;
const OIL_RGB = 0x1c1610;
const OIL_SHEEN = 0x6a5a8a;
const MUD_RGB = 0x5a3e22;
const BURN_RGB = [0xff6a1a, 0xffb43a, 0xffd860] as const;

/** Which stains a tank view carries, as bits (0 = clean). */
export function stainBits(e: TankView): number {
  return (
    ((e.wet ?? 0) > 0 ? STAIN_WET : 0) |
    ((e.oiled ?? 0) > 0 ? STAIN_OILED : 0) |
    ((e.muddy ?? 0) > 0 ? STAIN_MUDDY : 0) |
    ((e.burning ?? 0) > 0 ? STAIN_BURNING : 0)
  );
}

/** Half-and-half mix of two 0xRRGGBB colours (a hard 50% tone, no ramp). */
function half(a: number, b: number): number {
  return (((a & 0xfefefe) >> 1) + ((b & 0xfefefe) >> 1)) | 0;
}

/**
 * One hull cell's colour under its stains, on the sprite grid (column c, row r of sh rows, tick t):
 * every rule is a hard band or a checker dither, so the tint stays on whole cells. Mud cakes the
 * lowest two rows (the treads) and splashes a sparse dither above them; oil darkens a checker over
 * the whole hull with a sheen cell that slides along it; water darkens alternate cells of the
 * lower half blue, with a drip line that walks down; burning chars the top row in a flicker.
 */
export function stainTint(
  rgb: number,
  c: number,
  r: number,
  sh: number,
  bits: number,
  t: number,
): number {
  let out = rgb;
  const check = ((c + r) & 1) === 0;
  if (bits & STAIN_MUDDY) {
    if (r >= sh - 2) out = check ? MUD_RGB : half(out, MUD_RGB);
    else if (r >= sh - 4 && ((c * 3 + r) & 3) === 0) out = MUD_RGB;
  }
  if (bits & STAIN_OILED) {
    if (check) out = half(out, OIL_RGB);
    // a sheen cell runs along the hull every so often
    if (r === 1 && c === ((t >> 3) % 24) - 4) out = OIL_SHEEN;
  }
  if (bits & STAIN_WET) {
    if (r >= sh >> 1 && check) out = half(out, WET_RGB);
    if (c % 5 === 2 && r === ((t >> 4) + c) % sh) out = half(out, 0xbfe4fa);
  }
  if (bits & STAIN_BURNING) {
    if (r === 0 || (r === 1 && check)) out = half(out, 0x201008);
  }
  return out;
}

/**
 * Flames licking up off a burning tank: whole cells over its top row in hard bands (red, orange,
 * yellow by height), each column flickering on its own step. No glow, no blend.
 */
export function drawBurning(b: QuadBatch, x0: number, top: number, sw: number, t: number): void {
  for (let c = 1; c < sw - 1; c += 2) {
    const k = ((t >> 2) + c * 7) % 5;
    const h = k === 0 ? 0 : k < 3 ? 1 : k === 3 ? 2 : 3;
    for (let i = 0; i < h; i++) b.rect(x0 + c, top - 1 - i, 1, 1, BURN_RGB[Math.min(2, i)]!);
  }
}

/**
 * Dynamic lighting (render-only, never touches the sim): explosions, fireballs and other flashes
 * briefly light the terrain faces and tanks around them, and lava and burning napalm cast a warm
 * flickering light on the ground nearby. Light lands on the pixel grid in hard bands with ordered
 * dither between them, never as a smooth glow.
 *
 * Two kinds of source:
 * - point lights (`Lights`), up to `MAX_LIGHTS` a frame, fed from the effect system's glows;
 * - a heat field (`heatField`): per cell, the chamfer distance to the nearest hot or burning cell,
 *   rebuilt with the look scan every 20 ticks.
 */

export const MAX_LIGHTS = 8;
/** How far (cells) lava and flames light the ground. */
export const HEAT_REACH = 10;
/** Heat-field value for cells beyond `HEAT_REACH`. */
export const HEAT_NONE = 255;
/** Warm light colour of lava and flames. */
export const HEAT_RGB: readonly [number, number, number] = [1.0, 0.42, 0.1];
/** How strongly the heat field lights. */
export const HEAT_STRENGTH = 0.5;
/** Light bands per unit strength (hard steps, dithered between). */
export const LIGHT_BANDS = 4;

/** The frame's point lights, packed for `uniform4fv` / `uniform3fv`. */
export class Lights {
  /** x, y (map cells), radius (cells), strength. */
  readonly pos = new Float32Array(MAX_LIGHTS * 4);
  /** rgb 0–1. */
  readonly col = new Float32Array(MAX_LIGHTS * 3);
  count = 0;

  clear(): void {
    this.count = 0;
  }

  /** Add a light; when full, it replaces the weakest one if it is stronger. */
  add(x: number, y: number, r: number, strength: number, rgb: number): void {
    if (strength <= 0.01 || r < 1) return;
    let i = this.count;
    if (i >= MAX_LIGHTS) {
      let weak = 0;
      for (let k = 1; k < MAX_LIGHTS; k++) {
        if (this.weight(k) < this.weight(weak)) weak = k;
      }
      if (this.weight(weak) >= strength * r) return;
      i = weak;
    } else {
      this.count++;
    }
    this.pos[i * 4] = x;
    this.pos[i * 4 + 1] = y;
    this.pos[i * 4 + 2] = r;
    this.pos[i * 4 + 3] = strength;
    this.col[i * 3] = ((rgb >> 16) & 255) / 255;
    this.col[i * 3 + 1] = ((rgb >> 8) & 255) / 255;
    this.col[i * 3 + 2] = (rgb & 255) / 255;
  }

  private weight(i: number): number {
    return this.pos[i * 4 + 2]! * this.pos[i * 4 + 3]!;
  }
}

/** 4×4 ordered dither, same table as the shaders' `bayer`. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
function bayer(x: number, y: number): number {
  return (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
}

/** A light amount snapped to hard bands, dithered by cell (mirrors the shader). */
export function band(e: number, x: number, y: number): number {
  if (e <= 0) return 0;
  const q = Math.floor(e * LIGHT_BANDS + bayer(x, y) - 0.5) / LIGHT_BANDS;
  return Math.min(1.5, Math.max(0, q));
}

/** Light falling on map cell (x, y) from the point lights, unoccluded, banded; rgb out. */
export function lightAt(
  lights: Lights,
  x: number,
  y: number,
  out: [number, number, number],
): [number, number, number] {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  const cx = x + 0.5;
  const cy = y + 0.5;
  for (let i = 0; i < lights.count; i++) {
    const r = lights.pos[i * 4 + 2]!;
    const dx = lights.pos[i * 4]! - cx;
    const dy = lights.pos[i * 4 + 1]! - cy;
    const d = Math.hypot(dx, dy);
    if (d >= r) continue;
    const f = 1 - d / r;
    const q = band(f * (0.4 + 0.6 * f) * lights.pos[i * 4 + 3]!, x, y);
    out[0] += lights.col[i * 3]! * q;
    out[1] += lights.col[i * 3 + 1]! * q;
    out[2] += lights.col[i * 3 + 2]! * q;
  }
  return out;
}

/** Warm light amount (0–1, before `HEAT_STRENGTH`) at a heat-field distance; 0 at sources. */
export function heatFalloff(d: number): number {
  if (d === 0 || d > HEAT_REACH) return 0;
  const f = 1 - (d - 1) / HEAT_REACH;
  return f * f;
}

/** One channel lit by `k` (capped so a lit tank keeps its colour instead of going white). */
function litChannel(v: number, k: number): number {
  const q = Math.min(0.7, k);
  return Math.min(255, Math.round(v * (1 + q * 1.1) + q * 30));
}

/** Light an 0xRRGGBB colour by an rgb light amount: lifts the colour and warms it slightly. */
export function litColor(rgb: number, l: readonly [number, number, number]): number {
  if (l[0] <= 0 && l[1] <= 0 && l[2] <= 0) return rgb;
  return (
    (litChannel((rgb >> 16) & 255, l[0]) << 16) |
    (litChannel((rgb >> 8) & 255, l[1]) << 8) |
    litChannel(rgb & 255, l[2])
  );
}

/**
 * Chamfer distance (3-4 metric, in whole cells) from every cell whose material or coating has a
 * hot (2) or flaming (4) look flag, capped at `HEAT_REACH`; `HEAT_NONE` beyond. Only the box around
 * the sources is walked. Returns whether any source exists.
 */
export function heatField(
  terrain: Uint8Array,
  coating: Uint8Array,
  flags: Uint8Array,
  w: number,
  h: number,
  out: Uint8Array,
): boolean {
  out.fill(HEAT_NONE);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < terrain.length; i++) {
    if ((flags[terrain[i]!]! & 6) === 0 && (flags[coating[i]!]! & 6) === 0) continue;
    out[i] = 0;
    const x = i % w;
    const y = (i - x) / w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return false;
  x0 = Math.max(0, x0 - HEAT_REACH);
  y0 = Math.max(0, y0 - HEAT_REACH);
  x1 = Math.min(w - 1, x1 + HEAT_REACH);
  y1 = Math.min(h - 1, y1 + HEAT_REACH);
  // distances in thirds of a cell (3 straight, 4 diagonal) while walking, then whole cells
  const cap = HEAT_REACH * 3 + 3;
  const big = 250;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      out[i] = out[i] === 0 ? 0 : big;
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      let d = out[i]!;
      if (d === 0) continue;
      if (x > x0) d = Math.min(d, out[i - 1]! + 3);
      if (y > y0) {
        d = Math.min(d, out[i - w]! + 3);
        if (x > x0) d = Math.min(d, out[i - w - 1]! + 4);
        if (x < x1) d = Math.min(d, out[i - w + 1]! + 4);
      }
      out[i] = Math.min(d, big);
    }
  }
  for (let y = y1; y >= y0; y--) {
    for (let x = x1; x >= x0; x--) {
      const i = y * w + x;
      let d = out[i]!;
      if (d === 0) continue;
      if (x < x1) d = Math.min(d, out[i + 1]! + 3);
      if (y < y1) {
        d = Math.min(d, out[i + w]! + 3);
        if (x < x1) d = Math.min(d, out[i + w + 1]! + 4);
        if (x > x0) d = Math.min(d, out[i + w - 1]! + 4);
      }
      out[i] = Math.min(d, big);
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      const d = out[i]!;
      out[i] = d === 0 ? 0 : d > cap ? HEAT_NONE : Math.max(1, Math.round(d / 3));
    }
  }
  return true;
}

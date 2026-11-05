import type { ZoneView } from '@mudders/shared';
import { Shape, type QuadBatch } from './batch';
import { ZONE_COLOR } from './effects';
import type { PixelTheme } from './theme';

/**
 * Ambient layers (§2a): theme weather and lingering zones. Both are stateless: every particle's
 * position is a pure function of its index and the render time, so nothing is stored, nothing
 * drifts between clients, and a capture replays byte-identically. Everything snaps to map cells.
 */

/** Integer hash → [0, 1). */
function h01(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export interface AmbientProbe {
  width: number;
  height: number;
  solid(x: number, y: number): boolean;
}

/**
 * Theme weather: rain (streaks that vanish into the ground with a splash), snow (drifting flakes),
 * embers (rising sparks) and dust (slow motes). Stars are drawn by the sky shader instead.
 */
export function drawWeather(
  normal: QuadBatch,
  additive: QuadBatch,
  theme: PixelTheme,
  t: number,
  wind: number,
  probe: AmbientProbe,
  mult: number,
): void {
  const a = theme.ambient;
  if (a.kind === 'none' || a.kind === 'stars' || a.density <= 0) return;
  const W = probe.width;
  const H = probe.height;
  const n = Math.round((a.density * W * mult) / 1000);
  const lean = Math.max(-1.5, Math.min(1.5, wind * 120));
  for (let i = 0; i < n; i++) {
    const r0 = h01(i, 1);
    const r1 = h01(i, 2);
    const r2 = h01(i, 3);
    if (a.kind === 'rain') {
      const speed = 4 + r2 * 2;
      const span = H + 40;
      const y = Math.floor(mod(t * speed + r1 * span, span)) - 20;
      const x = Math.floor(mod(r0 * W + (y + 20) * (0.35 + lean * 0.5), W));
      if (y < 0) continue;
      if (probe.solid(x, y)) continue;
      if (probe.solid(x, y + 1)) {
        // splash: two droplets either side of where it hits
        normal.push(x - 0.5, y + 0.5, 1, 1, a.color, 0.7);
        normal.push(x + 1.5, y - 0.5, 1, 1, a.color, 0.5);
        continue;
      }
      normal.push(x + 0.5, y - 2, 1, 5, a.color, 0.4 + r2 * 0.3);
    } else if (a.kind === 'snow') {
      const speed = 0.25 + r2 * 0.3;
      const span = H + 10;
      const y = Math.floor(mod(t * speed + r1 * span, span)) - 5;
      const sway = Math.round(Math.sin(t * 0.03 + r0 * 40) * 2 + y * lean * 0.3);
      const x = Math.floor(mod(r0 * W + sway, W));
      if (y < 0 || probe.solid(x, y)) continue;
      const size = r2 > 0.8 ? 2 : 1;
      normal.push(x + size / 2, y + size / 2, size, size, a.color, 0.85);
    } else if (a.kind === 'embers') {
      const speed = 0.3 + r2 * 0.5;
      const span = H + 10;
      const y = H - Math.floor(mod(t * speed + r1 * span, span));
      const sway = Math.round(Math.sin(t * 0.05 + r0 * 30) * 3 + (H - y) * lean * 0.4);
      const x = Math.floor(mod(r0 * W + sway, W));
      if (y < 0 || y >= H || probe.solid(x, y)) continue;
      // flicker between two heats; fade near the top
      const hot = h01(i, Math.floor(t / 6)) > 0.5;
      additive.push(x + 0.5, y + 0.5, 1, 1, hot ? 0xffd070 : a.color, Math.min(1, y / (H * 0.4)));
    } else {
      // dust motes
      const x = Math.floor(mod(r0 * W + t * (0.08 + r2 * 0.1) * (lean >= 0 ? 1 : -1), W));
      const y = Math.floor(r1 * H * 0.85 + Math.sin(t * 0.02 + r0 * 50) * 4);
      if (y < 0 || probe.solid(x, y)) continue;
      normal.push(x + 0.5, y + 0.5, 1, 1, a.color, 0.3 + r2 * 0.3);
    }
  }
}

/**
 * Lingering zones: a gas cloud of drifting dithered puffs, an acid haze dripping green drops, and a
 * resonance field of pulsing cell rings. Fades as its turns run out.
 */
export function drawZones(
  normal: QuadBatch,
  additive: QuadBatch,
  zones: readonly ZoneView[],
  t: number,
  probe: AmbientProbe,
  mult: number,
): void {
  for (let zi = 0; zi < zones.length; zi++) {
    const z = zones[zi]!;
    const R = Math.max(4, z.radius);
    const fade = Math.min(1, 0.45 + z.turns * 0.2);
    const salt = z.x * 131 + z.y * 7;
    if (z.look === 'gas' || z.look === 'acid') {
      const col = z.look === 'gas' ? ZONE_COLOR[0] : ZONE_COLOR[1];
      const puffs = Math.round(Math.min(40, (R * R) / 60 + 6) * Math.max(0.5, mult));
      for (let i = 0; i < puffs; i++) {
        const ang = h01(i, salt) * Math.PI * 2 + t * 0.008 * (h01(i, salt + 1) - 0.5);
        const rad = Math.sqrt(h01(i, salt + 2)) * R * 0.85;
        const x = Math.round(z.x + Math.cos(ang) * rad + Math.sin(t * 0.02 + i) * 2);
        const y = Math.round(z.y + Math.sin(ang) * rad * 0.6 - 2);
        const size = 5 + h01(i, salt + 3) * 7;
        normal.push(x, y, size, size, col, (z.look === 'gas' ? 0.3 : 0.2) * fade, Shape.Pixel);
      }
      if (z.look === 'acid') {
        const drops = Math.round(Math.min(30, R / 2 + 4) * Math.max(0.5, mult));
        for (let i = 0; i < drops; i++) {
          const x = Math.round(z.x + (h01(i, salt + 4) - 0.5) * R * 1.6);
          const span = R * 1.4;
          const y = Math.round(z.y - R * 0.4 + mod(t * 1.2 + h01(i, salt + 5) * span, span));
          if (probe.solid(x, y)) continue;
          normal.push(x + 0.5, y, 1, 2, 0xd8ff60, 0.85 * fade);
        }
      }
    } else {
      // resonance: two rings of single cells expanding from the centre, plus a pulsing core
      for (let k = 0; k < 2; k++) {
        const ph = mod(t / 50 + k / 2, 1);
        const r = Math.max(2, R * ph);
        const steps = Math.max(12, Math.round(r * 5));
        const alpha = (1 - ph) * 0.8 * fade;
        let lx = NaN;
        let ly = NaN;
        for (let s = 0; s < steps; s++) {
          const ang = (s / steps) * Math.PI * 2;
          const x = Math.round(z.x + Math.cos(ang) * r);
          const y = Math.round(z.y + Math.sin(ang) * r);
          if (x === lx && y === ly) continue;
          lx = x;
          ly = y;
          if (probe.solid(x, y)) continue;
          additive.push(x + 0.5, y + 0.5, 1, 1, ZONE_COLOR[2], alpha);
        }
      }
      const beat = mod(t, 25) < 4 ? 1 : 0.5;
      additive.push(z.x + 0.5, z.y + 0.5, 6, 6, ZONE_COLOR[2], 0.5 * beat * fade, Shape.Pixel);
    }
  }
}

/** Storm theme: sky lightning brightness at time `t` (0 = none), every ~`every` ticks. */
export function stormFlash(t: number, every: number): number {
  if (every <= 0) return 0;
  const win = Math.floor(t / 30);
  if (h01(win, 91) >= 30 / every) return 0;
  const age = t - win * 30;
  return age < 2 ? 0.32 : age >= 3 && age < 5 ? 0.18 : 0;
}

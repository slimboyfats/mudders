import { FP, toFixed, type Projectile, type SimApi } from '@mudders/sim';

/**
 * Shared helpers for `flight.*` behaviours. Everything is fixed-point integer maths plus
 * `Math.sqrt` (§6.3). Flights never draw from the match RNG: the AI's predictor runs them too.
 */

/** One semi-implicit Euler step under gravity, wind and weather drag (the ballistic arc, §3.4). */
export function ballisticStep(
  api: SimApi,
  p: Projectile,
  gravityScale: number,
  windScale: number,
): void {
  p.vx += Math.trunc((api.wind * toFixed(windScale)) / FP);
  p.vy += Math.trunc((api.gravity * toFixed(gravityScale)) / FP);
  // weather drag (rain, snow): a share of the speed lost every tick; none in clear skies, and
  // none for what the air doesn't touch (beams ignore wind)
  if (api.drag !== 0 && windScale !== 0) {
    p.vx -= Math.trunc((p.vx * api.drag) / FP);
    p.vy -= Math.trunc((p.vy * api.drag) / FP);
  }
  p.x += p.vx;
  p.y += p.vy;
}

/** Scale (vx, vy) to length `speed` (all fixed-point); straight up when it has no direction. */
export function withSpeed(vx: number, vy: number, speed: number): [number, number] {
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len < 1) return [0, -speed];
  return [Math.trunc((vx * speed) / len), Math.trunc((vy * speed) / len)];
}

/** Put the shell in the middle of a cell. */
export function placeAt(p: Projectile, x: number, y: number): void {
  p.x = x * FP + FP / 2;
  p.y = y * FP + FP / 2;
}

export function cellX(p: Projectile): number {
  return Math.floor(p.x / FP);
}

export function cellY(p: Projectile): number {
  return Math.floor(p.y / FP);
}

/** Solid at (x, y)? Off the sides counts as solid, above the map as air, below as solid. */
export function solidAt(api: SimApi, x: number, y: number): boolean {
  const g = api.grid;
  if (x < 0 || x >= g.width || y >= g.height) return true;
  if (y < 0) return false;
  return g.material[y * g.width + x] !== 0;
}

/** True when (x, y) is sticky ground (tar): rolling and bouncing shells stick to it. */
export function stickyAt(api: SimApi, x: number, y: number): boolean {
  const g = api.grid;
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return false;
  return api.mats.sticky[g.material[y * g.width + x]!] !== 0;
}

/**
 * The live enemy decoy (`api.lures`, not on `team`) nearest (x, y) within `range` cells: its
 * centre and squared distance, or null. Homing warheads go for a decoy over a real tank unless the
 * tank is less than half as far (a decoy runs hot on purpose).
 */
export function lureNear(
  api: SimApi,
  team: number,
  x: number,
  y: number,
  range: number,
): { x: number; y: number; d2: number; index: number } | null {
  let best: { x: number; y: number; d2: number; index: number } | null = null;
  let bd = range * range;
  for (let i = 0; i < api.lures.length; i++) {
    const l = api.lures[i]!;
    if (!l.alive || l.team === team) continue;
    const cy = l.y - (l.h >> 1);
    const dx = l.x - x;
    const dy = cy - y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = { x: l.x, y: cy, d2: d, index: i };
    }
  }
  return best;
}

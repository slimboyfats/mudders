import type { TankView } from '@mudders/shared';

/**
 * How a hurt tank looks (tanks with weight): 0 whole, 1 battered at half health or less (scorched
 * plates, thin grey smoke), 2 crippled at a quarter or less (the sim's `wounds.at`: more scorch, a
 * broken track, thick black smoke and sparks).
 */
export const DAMAGE_BATTERED = 50;
export const DAMAGE_CRIPPLED = 25;

export function damageLevel(e: Pick<TankView, 'alive' | 'health' | 'maxHealth'>): 0 | 1 | 2 {
  if (!e.alive) return 0;
  const pct = (e.health * 100) / Math.max(1, e.maxHealth);
  return pct <= DAMAGE_CRIPPLED ? 2 : pct <= DAMAGE_BATTERED ? 1 : 0;
}

const SCORCH = 0x1a1614;
const BARE = 0x6a6258;

/** Small fixed hash of a hull cell, different per player so no two tanks dent alike. */
function cellHash(c: number, r: number, player: number): number {
  let h = Math.imul(c * 31 + r * 131 + player * 977 + 7, 0x9e3779b1);
  h ^= h >>> 15;
  return (Math.imul(h, 0x85ebca6b) >>> 16) & 255;
}

/** Half-and-half mix of two 0xRRGGBB colours (a hard 50% tone, no ramp). */
function half(a: number, b: number): number {
  return (((a & 0xfefefe) >> 1) + ((b & 0xfefefe) >> 1)) | 0;
}

/**
 * One hull cell under its damage, on the sprite grid (column c, row r of an sw × sh sprite): the
 * colour to draw, or -1 for a cell that is gone. Battered: about one cell in six is scorched dark
 * and a few show bare metal. Crippled: one cell in three is scorched, and the track (the bottom
 * row) has lost a run of three links on one side, with the link above it hanging loose.
 */
export function damageTint(
  rgb: number,
  c: number,
  r: number,
  sw: number,
  sh: number,
  level: number,
  player: number,
): number {
  if (level <= 0) return rgb;
  if (level >= 2) {
    // the broken run sits toward one end of the track, by player
    const g0 = (player & 1) === 0 ? 2 : sw - 5;
    if (r === sh - 1 && c >= g0 && c < g0 + 3) return -1;
    if (r === sh - 2 && c === g0 + 1) return SCORCH;
  }
  const h = cellHash(c, r, player);
  if (h < (level >= 2 ? 84 : 42)) return half(rgb, SCORCH);
  if (h > (level >= 2 ? 236 : 246)) return BARE;
  return rgb;
}

/** A puff of engine smoke off a hurt tank, or null on ticks with none. */
export interface DamagePuff {
  dx: number;
  size: number;
  life: number;
  color: number;
  spark: boolean;
}

/**
 * What a hurt tank lets off this cosmetic tick: battered, a small grey puff every 16 ticks;
 * crippled, a bigger black one every 6 ticks, and a spark with every fourth of those.
 */
export function damagePuff(level: number, player: number, fxTick: number): DamagePuff | null {
  if (level <= 0) return null;
  const every = level >= 2 ? 6 : 16;
  const k = fxTick + player * 3;
  if (k % every !== 0) return null;
  const n = Math.trunc(k / every);
  const seed = cellHash(n, level, player);
  return {
    dx: (seed % 7) - 3,
    size: level >= 2 ? 2 + (seed & 1) : 1 + (seed & 1),
    life: level >= 2 ? 60 : 36,
    color: level >= 2 ? 0x2a2628 : 0x8a8488,
    spark: level >= 2 && n % 4 === 0,
  };
}

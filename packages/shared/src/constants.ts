/** Player cap (§3.1, raised to 8 in milestone 7). Code paths are written for N players; this is the only place the cap lives. */
export const MAX_PLAYERS = 8;

/** Fixed simulation rate in ticks per second (§3.4). */
export const TICK_RATE = 60;

/**
 * Fixed-point scale used by the simulation for positions, velocities and trig (§6.3). Values are
 * integers stored in JS numbers; `FP` is 1.0. Products of two fixed-point values stay below 2^53
 * for every quantity the sim multiplies, so integer arithmetic on doubles is exact everywhere.
 */
export const FP_SHIFT = 16;
export const FP = 1 << FP_SHIFT;

/** Map size presets (§4.1). */
export const MAP_SIZES = {
  small: { width: 800, height: 400 },
  medium: { width: 1200, height: 600 },
  large: { width: 1600, height: 800 },
} as const;

/** Cell id 0 is always air. Every other cell id is assigned by a material manifest. */
export const AIR = 0;

/** Damage types (§4b). New types are added here and default to resistance 1. */
export const DAMAGE_TYPES = [
  'blast',
  'kinetic',
  'heat',
  'cold',
  'shock',
  'dig',
  'corrosive',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/**
 * Air temperature (§3.4), whole °C. Each round starts at the map's base (plus the weather's offset
 * and a small seeded jitter) and drifts a few degrees every turn. Between `TEMP_COLD` and `TEMP_HOT`
 * nothing plays differently; below or above it, content scales fuel, fire, frost and drag by how far
 * past the band it is (`tempHeat`, `tempChill`).
 */
export const TEMP_MIN = -20;
export const TEMP_MAX = 45;
/** Base when neither the map nor the setup names one. */
export const TEMP_MILD = 15;
/** At or below this it counts as cold. */
export const TEMP_COLD = 0;
/** At or above this it counts as hot. */
export const TEMP_HOT = 30;
/** Largest per-turn drift step, °C. */
export const TEMP_DRIFT = 3;

/** How hot it is past the mild band, 0 (≤ TEMP_HOT) … 1000 (TEMP_MAX). Integer thousandths. */
export function tempHeat(t: number): number {
  if (t <= TEMP_HOT) return 0;
  return Math.min(1000, Math.trunc(((t - TEMP_HOT) * 1000) / (TEMP_MAX - TEMP_HOT)));
}

/** How cold it is past the mild band, 0 (≥ TEMP_COLD) … 1000 (TEMP_MIN). Integer thousandths. */
export function tempChill(t: number): number {
  if (t >= TEMP_COLD) return 0;
  return Math.min(1000, Math.trunc(((TEMP_COLD - t) * 1000) / (TEMP_COLD - TEMP_MIN)));
}

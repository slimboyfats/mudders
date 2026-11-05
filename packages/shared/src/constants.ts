/** Player cap for v1 (§3.1). Code paths are written for N players; this is the only place 4 lives. */
export const MAX_PLAYERS = 4;

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

import { MAP_SIZES, MAX_PLAYERS } from '@mudders/shared';
import type { MatchRules, WorldOptions } from '@mudders/sim';

export type MapSize = keyof typeof MAP_SIZES;

/** A player slot on the setup screen: a human on this device, an AI personality, or empty. */
export type Slot = 'human' | 'off' | `ai.${string}`;

export const PRESETS = {
  quick: { rounds: 1, turnTimer: 10 },
  standard: { rounds: 3, turnTimer: 15 },
  long: { rounds: 5, turnTimer: 15 },
} as const;
export type Preset = keyof typeof PRESETS;

const SCENERY_GEN = {
  none: 'gen.hills',
  village: 'gen.village',
  badlands: 'gen.badlands',
} as const;

/** Match setup (§8 lobby settings), persisted per device. Only `toWorldOptions` reaches the sim. */
export interface MatchSetup {
  slots: Slot[];
  size: MapSize;
  /**
   * Props on the map (§4c): bare hills, a village with houses, trees and boulders, or badlands
   * with stone arches and ledges to shelter under.
   */
  scenery: 'none' | 'village' | 'badlands';
  rounds: number;
  /** Seconds; 0 = off. */
  turnTimer: number;
  wind: 'none' | 'constant' | 'perTurn';
  suddenDeath: boolean;
  startingCash: number;
}

const KEY = 'mudders.setup.v1';

export function defaultSetup(): MatchSetup {
  const small = typeof window !== 'undefined' && Math.min(innerWidth, innerHeight) < 500;
  return {
    slots: ['human', 'ai.shooter', 'off', 'off', 'off', 'off', 'off', 'off'],
    size: small ? 'small' : 'medium',
    scenery: 'village',
    rounds: 3,
    turnTimer: 15,
    wind: 'perTurn',
    suddenDeath: true,
    startingCash: 3000,
  };
}

export function loadSetup(): MatchSetup {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...defaultSetup(), ...(JSON.parse(raw) as Partial<MatchSetup>) };
      s.slots = Array.from({ length: MAX_PLAYERS }, (_, i) => s.slots[i] ?? 'off');
      if (!(s.scenery in SCENERY_GEN)) s.scenery = 'village';
      return s;
    }
  } catch {
    // private mode or bad data: defaults
  }
  return defaultSetup();
}

export function saveSetup(s: MatchSetup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

/** Active slots in order; a match needs at least two. */
export function activeSlots<S extends string>(s: { slots: readonly S[] }): S[] {
  return s.slots.filter((x) => x !== 'off');
}

/** Anything shaped like a setup: the local `MatchSetup` or the networked `NetSetup`. */
export type SetupLike = Omit<MatchSetup, 'slots'> & { slots: readonly string[] };

export function toWorldOptions(s: SetupLike, seed: number): WorldOptions {
  const slots = activeSlots(s);
  const rules: MatchRules = {
    rounds: s.rounds,
    turnTimer: s.turnTimer,
    suddenDeath: s.suddenDeath,
    windType: s.wind,
    startingCash: s.startingCash,
  };
  return {
    seed,
    mode: 'mode.classic',
    players: slots.length,
    map: { ...MAP_SIZES[s.size], generator: SCENERY_GEN[s.scenery] },
    bots: slots.map((x) => (x.startsWith('ai.') ? x : null)),
    rules,
  };
}

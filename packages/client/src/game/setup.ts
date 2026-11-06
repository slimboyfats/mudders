import { MAP_SIZES, MAX_PLAYERS, type WindType } from '@mudders/shared';
import type { MatchRules, WorldOptions } from '@mudders/sim';

export type MapSize = keyof typeof MAP_SIZES;

/** A player slot on the setup screen: a human on this device, an AI personality, or empty. */
export type Slot = 'human' | 'off' | `ai.${string}`;

/** Match-length presets (§8; marathon added in milestone 7 for longer evenings). */
export const PRESETS = {
  quick: { rounds: 1, turnTimer: 10 },
  standard: { rounds: 3, turnTimer: 15 },
  long: { rounds: 5, turnTimer: 15 },
  marathon: { rounds: 10, turnTimer: 20 },
} as const;
export type Preset = keyof typeof PRESETS;

export const PRESET_NAMES: Record<Preset, string> = {
  quick: 'Quick',
  standard: 'Standard',
  long: 'Long',
  marathon: 'Marathon',
};

/** Shots each player fires in an average round (milestone 3 playtests: 4 players, 3 rounds, 5–10 min). */
const SHOTS_PER_ROUND = 3;
/** Seconds between rounds (shop, scoreboard). */
const BETWEEN_ROUNDS = 20;

/**
 * Rough match length in minutes for the setup screen. A turn takes about half its timer plus the
 * shell's flight (an untimed turn counts as a 20 s timer). A guide, not a promise.
 */
export function estimateMinutes(rounds: number, turnTimer: number, players: number): number {
  const turn = (turnTimer > 0 ? turnTimer : 20) * 0.5 + 6;
  const secs = rounds * (Math.max(2, players) * SHOTS_PER_ROUND * turn + BETWEEN_ROUNDS);
  return Math.max(1, Math.round(secs / 60));
}

const SCENERY_GEN = {
  none: 'gen.hills',
  village: 'gen.village',
  badlands: 'gen.badlands',
  marsh: 'gen.marsh',
} as const;

/** Match setup (§8 lobby settings), persisted per device. Only `toWorldOptions` reaches the sim. */
export interface MatchSetup {
  slots: Slot[];
  size: MapSize;
  /**
   * Props on the map (§4c): bare hills, a village with houses, trees and boulders, or badlands
   * with stone arches and ledges to shelter under, or a marsh whose mud valleys squash under blasts.
   */
  scenery: 'none' | 'village' | 'badlands' | 'marsh';
  rounds: number;
  /** Seconds; 0 = off. */
  turnTimer: number;
  wind: WindType;
  suddenDeath: boolean;
  startingCash: number;
  /**
   * Team play (milestone 7): team per slot (0–3, shown as A–D), or null for a free-for-all.
   * Indexed like `slots`; off slots keep their team for when they come back.
   */
  teams: number[] | null;
  /**
   * Tank type per slot (§3.2): a `tank.*` id, "random", or "auto" (a bot's favourite tank, the
   * default tank for a human). Indexed like `slots`.
   */
  tanks: string[];
}

/** Team letters for the UI. */
export const TEAM_NAMES = ['A', 'B', 'C', 'D'] as const;
export const teamName = (t: number) => TEAM_NAMES[t] ?? String(t + 1);

/** Default teams: alternate A, B, A, B… so every team has a player as seats fill up. */
export function defaultTeams(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i % 2);
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
    teams: null,
    tanks: Array.from({ length: MAX_PLAYERS }, () => 'auto'),
  };
}

export function loadSetup(): MatchSetup {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...defaultSetup(), ...(JSON.parse(raw) as Partial<MatchSetup>) };
      s.slots = Array.from({ length: MAX_PLAYERS }, (_, i) => s.slots[i] ?? 'off');
      if (!(s.scenery in SCENERY_GEN)) s.scenery = 'village';
      if (s.teams !== null && !Array.isArray(s.teams)) s.teams = null;
      const tanks: unknown = s.tanks;
      s.tanks = Array.from({ length: MAX_PLAYERS }, (_, i) => {
        const t = Array.isArray(tanks) ? (tanks as unknown[])[i] : undefined;
        return typeof t === 'string' ? t : 'auto';
      });
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
export type SetupLike = Omit<MatchSetup, 'slots' | 'teams' | 'tanks'> & {
  slots: readonly string[];
  teams: readonly number[] | null;
  tanks: readonly string[];
};

/** Tank pick of each active slot, in player order. */
export function activeTanks(s: Pick<SetupLike, 'slots' | 'tanks'>): string[] {
  const out: string[] = [];
  s.slots.forEach((x, i) => {
    if (x !== 'off') out.push(s.tanks[i] ?? 'auto');
  });
  return out;
}

/** Team of each active slot, in player order; null for a free-for-all. */
export function activeTeams(s: Pick<SetupLike, 'slots' | 'teams'>): number[] | null {
  const { teams } = s;
  if (!teams) return null;
  const out: number[] = [];
  s.slots.forEach((x, i) => {
    if (x !== 'off') out.push(teams[i] ?? i % 2);
  });
  return out;
}

/** Can this setup start? At least two players, and with teams on, at least two teams. */
export function canStart(s: Pick<SetupLike, 'slots' | 'teams'>): boolean {
  if (activeSlots(s).length < 2) return false;
  const t = activeTeams(s);
  return !t || new Set(t).size >= 2;
}

export function toWorldOptions(s: SetupLike, seed: number): WorldOptions {
  const slots = activeSlots(s);
  const teams = activeTeams(s);
  const rules: MatchRules = {
    rounds: s.rounds,
    turnTimer: s.turnTimer,
    suddenDeath: s.suddenDeath,
    windType: s.wind,
    startingCash: s.startingCash,
  };
  return {
    seed,
    mode: teams ? 'mode.teams' : 'mode.classic',
    players: slots.length,
    map: { ...MAP_SIZES[s.size], generator: SCENERY_GEN[s.scenery] },
    bots: slots.map((x) => (x.startsWith('ai.') ? x : null)),
    tanks: activeTanks(s),
    rules,
    ...(teams ? { teams } : {}),
  };
}

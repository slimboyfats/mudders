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
  // every round opens with the shop, round 1 included
  const secs = rounds * (Math.max(2, players) * SHOTS_PER_ROUND * turn + BETWEEN_ROUNDS);
  return Math.max(1, Math.round(secs / 60));
}

const SCENERY_GEN = {
  none: 'gen.hills',
  village: 'gen.village',
  badlands: 'gen.badlands',
  marsh: 'gen.marsh',
  city: 'gen.city',
  islands: 'gen.islands',
  caves: 'gen.caves',
  glacier: 'gen.glacier',
  claypits: 'gen.claypits',
  lakeland: 'gen.lakeland',
} as const;

/** Match setup (§8 lobby settings), persisted per device. Only `toWorldOptions` reaches the sim. */
export interface MatchSetup {
  slots: Slot[];
  size: MapSize;
  /**
   * Props on the map (§4c): bare hills, a village with houses, trees and boulders, or badlands
   * with stone arches and ledges to shelter under, or a marsh whose mud valleys squash under blasts, a city of towers and blocks, floating islands over a deep drop, or a cave under a stone roof, a glacier with frozen lakes, clay pits, or lakeland hills with water in the hollows.
   */
  scenery: keyof typeof SCENERY_GEN;
  rounds: number;
  /** Seconds; 0 = off. */
  turnTimer: number;
  wind: WindType;
  /** Weather (§3.4): rain or snow change shots and terrain; random picks one from the match seed. */
  weather?: WeatherPick | undefined;
  suddenDeath: boolean;
  /** Each player's turn sudden death starts on (§3.1); unset = the mode's default (turn 8). */
  suddenDeathFrom?: number | undefined;
  startingCash: number;
  /** Supply drops (§3.8): how often crates parachute in; unset (older saves, older hosts) = off. */
  drops?: DropRate | undefined;
  /** Cash every player gets each round on top of their winnings (§3.6); unset or 0 = none. */
  roundBonus?: number | undefined;
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

export const WEATHER_PICKS = ['clear', 'rain', 'snow', 'random'] as const;

/** Supply drop rates for the rules picker. */
export const DROP_RATES = ['off', 'rare', 'normal', 'often'] as const;
export type DropRate = (typeof DROP_RATES)[number];
export type WeatherPick = (typeof WEATHER_PICKS)[number];

/** The `weather.*` id a pick plays with (random: drawn from the seed, so every peer agrees). */
export function weatherFor(pick: WeatherPick, seed: number): string | undefined {
  const p = pick === 'random' ? (['clear', 'rain', 'snow'] as const)[(seed >>> 0) % 3] : pick;
  if (!p) return undefined;
  return p === 'clear' ? undefined : `weather.${p}`;
}

/** Turns sudden death can start from in the rules picker; the mode's default is turn 8. */
export const SUDDEN_DEATH_TURNS = [3, 5, 8, 10] as const;
export const SUDDEN_DEATH_DEFAULT = 8;

/** Starting cash steps in the rules picker; the default is 3,000. */
export const STARTING_CASH_STEPS = [0, 3000, 10000, 30000, 50000, 100000] as const;
/** Per-round bonus steps in the rules picker; 0 = off (the default). */
export const ROUND_BONUS_STEPS = [0, 5000, 10000, 20000, 50000] as const;

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
    weather: 'clear',
    suddenDeath: true,
    suddenDeathFrom: SUDDEN_DEATH_DEFAULT,
    startingCash: 3000,
    drops: 'normal',
    roundBonus: 0,
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
      if (!s.weather || !WEATHER_PICKS.includes(s.weather)) s.weather = 'clear';
      if (!s.drops || !DROP_RATES.includes(s.drops)) s.drops = 'normal';
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
    ...(s.suddenDeath && s.suddenDeathFrom !== undefined
      ? { suddenDeathFrom: s.suddenDeathFrom }
      : {}),
    windType: s.wind,
    startingCash: s.startingCash,
    ...(s.roundBonus ? { roundBonus: s.roundBonus } : {}),
    // everyone shops before round 1 too, with the same 30 s timer as between rounds (§3.6)
    openingShop: true,
    // swallow flocks over every map (a shell that hits one goes off there)
    birds: true,
    // the map's own events: Badlands' volcano, Glacier's avalanches
    mapEvents: true,
    ...(s.drops && s.drops !== 'off' ? { drops: s.drops } : {}),
  };
  return {
    seed,
    mode: teams ? 'mode.teams' : 'mode.classic',
    players: slots.length,
    map: { ...MAP_SIZES[s.size], generator: SCENERY_GEN[s.scenery] },
    bots: slots.map((x) => (x.startsWith('ai.') ? x : null)),
    tanks: activeTanks(s),
    rules,
    weather: weatherFor(s.weather ?? 'clear', seed),
    ...(teams ? { teams } : {}),
  };
}

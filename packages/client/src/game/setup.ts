import { MAP_SIZES, MAX_PLAYERS, type WindType } from '@mudders/shared';
import type { MatchRules, RoundPlan, WorldOptions } from '@mudders/sim';

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

/** A scenery pick: one map for the whole match, or `shuffle` for a different map each round. */
export type SceneryPick = keyof typeof SCENERY_GEN | 'shuffle';

/** Small seeded generator (mulberry32): every peer derives the same rounds from the seed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The generator for each round of a shuffled match: every map once in a shuffled order before any
 * comes back, and never the same map two rounds running.
 */
export function shuffledMaps(rounds: number, seed: number): string[] {
  const all = Object.values(SCENERY_GEN) as string[];
  const rnd = seeded(seed ^ 0x5ce9e5);
  const out: string[] = [];
  while (out.length < rounds) {
    const deck: string[] = [];
    // inside-out Fisher–Yates: each map lands at a random slot of the lap
    for (const id of all) {
      const j = Math.floor(rnd() * (deck.length + 1));
      deck.splice(j, 0, id);
    }
    // a fresh lap never opens with the map the last one closed on
    if (deck[0] === out[out.length - 1]) deck.reverse();
    out.push(...deck);
  }
  return out.slice(0, rounds);
}

/**
 * Round twists: one rule that changes for a single round. Each entry is what the sim gets for that
 * round (percent of the normal value); `name` is what the HUD calls it.
 */
export const TWISTS = [
  { name: 'Low gravity', gravity: 50 },
  { name: 'Gale', wind: 250 },
  { name: 'Double damage', damage: 200 },
  { name: 'Gold rush', cash: 300 },
  { name: 'Meteor night', events: ['terrainop.meteor-night'] },
  { name: 'Rising water', events: ['terrainop.rising-water'] },
  { name: 'Lightning storm', weather: 'weather.rain', events: ['terrainop.lightning-storm'] },
] as const;

/** Odds a round gets a twist, out of 100. */
const TWIST_CHANCE = 50;

/**
 * The twist for each round (or null for a normal round): about every other round, drawn from the
 * seed so every peer agrees, and never the same twist two rounds running.
 */
export function roundTwists(rounds: number, seed: number): ((typeof TWISTS)[number] | null)[] {
  const rnd = seeded(seed ^ 0x7a157);
  const out: ((typeof TWISTS)[number] | null)[] = [];
  let last = -1;
  for (let r = 0; r < rounds; r++) {
    if (rnd() * 100 >= TWIST_CHANCE) {
      out.push(null);
      continue;
    }
    let k = Math.floor(rnd() * TWISTS.length);
    if (k === last) k = (k + 1) % TWISTS.length;
    last = k;
    out.push(TWISTS[k] ?? null);
  }
  return out;
}

/** Match setup (§8 lobby settings), persisted per device. Only `toWorldOptions` reaches the sim. */
export interface MatchSetup {
  slots: Slot[];
  size: MapSize;
  /**
   * Props on the map (§4c): bare hills, a village with houses, trees and boulders, or badlands
   * with stone arches and ledges to shelter under, or a marsh whose mud valleys squash under blasts, a city of towers and blocks, floating islands over a deep drop, or a cave under a stone roof, a glacier with frozen lakes, clay pits, or lakeland hills with water in the hollows.
   */
  scenery: SceneryPick;
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
  /** Round twists: about every other round one rule changes (Low gravity, Gale…); unset = off. */
  twists?: boolean | undefined;
  /** Shop deals: every shop has a few weapons at half price and a couple sold out; unset = off. */
  deals?: boolean | undefined;
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

/**
 * The `weather.*` id a pick plays with in a round (random: drawn from the seed and the round, so
 * every peer agrees and the sky changes between rounds).
 */
export function weatherFor(pick: WeatherPick, seed: number, round = 0): string | undefined {
  const roll = round === 0 ? seed >>> 0 : Math.floor(seeded(seed ^ Math.imul(round, 0x9e37))() * 3);
  const p = pick === 'random' ? (['clear', 'rain', 'snow'] as const)[roll % 3] : pick;
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
    twists: false,
    deals: false,
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
      if (s.scenery !== 'shuffle' && !(s.scenery in SCENERY_GEN)) s.scenery = 'village';
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
    ...(s.deals ? { shopDeals: true } : {}),
  };
  const shuffle = s.scenery === 'shuffle';
  const maps = shuffle ? shuffledMaps(s.rounds, seed) : null;
  const weather = s.weather ?? 'clear';
  const twists = s.twists ? roundTwists(s.rounds, seed) : null;
  // a different map, sky or rule each round: shuffled scenery, random weather, round twists
  const perRound =
    shuffle || twists || (weather === 'random' && s.rounds > 1)
      ? Array.from({ length: s.rounds }, (_, r): RoundPlan => {
          const t = twists?.[r];
          return {
            ...(maps?.[r] ? { generator: maps[r] } : {}),
            weather: weatherFor(weather, seed, r) ?? null,
            ...(t ? { ...t, twist: t.name } : {}),
          };
        })
      : null;
  return {
    seed,
    mode: teams ? 'mode.teams' : 'mode.classic',
    players: slots.length,
    map: {
      ...MAP_SIZES[s.size],
      generator: maps?.[0] ?? SCENERY_GEN[s.scenery as keyof typeof SCENERY_GEN],
    },
    bots: slots.map((x) => (x.startsWith('ai.') ? x : null)),
    tanks: activeTanks(s),
    rules,
    weather: weatherFor(weather, seed),
    ...(perRound ? { perRound } : {}),
    ...(teams ? { teams } : {}),
  };
}

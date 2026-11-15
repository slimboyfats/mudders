import type { WindType } from '@mudders/shared';
import type { MatchRules, ResolvedContent, RoundPlan, World, WorldOptions } from '@mudders/sim';

/**
 * Solo challenges: a ladder of set pieces against still targets and bots, on fixed maps, with a
 * fixed kit and a goal. Each is plain data turned into ordinary `WorldOptions`, so the sim knows
 * nothing about challenges: targets are tanks left out of the turn order (they never shoot), the
 * kit is a tank inventory override, and the referee (`ChallengeRun`) only watches the world.
 * Notes: docs/SOLO-CHALLENGES.md.
 */

/** A tank on the other side: a still target (no `bot`), or a bot that shoots back. */
export interface ChallengeFoe {
  /** Map column. */
  x: number;
  /** `ai.*` personality; unset = a target that never takes a turn. */
  bot?: string;
  tank?: string;
  /** Starting health instead of the tank's full health. */
  health?: number;
  /** Kit for a bot, on top of nothing (the mode's loadout is cleared). Unset = the mode's loadout. */
  inventory?: Record<string, number>;
}

/** How a cleared challenge earns its second and third star. */
export type StarRule =
  /** Shots fired: at most `three` for ★★★, at most `two` for ★★. */
  | { by: 'shots'; three: number; two: number }
  /** Health left, percent of full: at least `three` for ★★★, at least `two` for ★★. */
  | { by: 'health'; three: number; two: number };

export interface Challenge {
  /** Permanent: saved stars are keyed by it. */
  id: string;
  chapter: number;
  name: string;
  /** The goal, one line. */
  brief: string;
  /** Shown after a miss or two. */
  hint?: string;
  seed: number;
  map: { generator: string; width: number; height: number };
  you: { x: number; tank?: string; health?: number; inventory: Record<string, number> };
  foes: ChallengeFoe[];
  /** Fixed wind for the whole challenge (cells/tick², + blows right); unset = `windType`. */
  wind?: number;
  windType?: WindType;
  weather?: string;
  /** A round twist the challenge is played under (Low gravity, Gale…). */
  twist?: Omit<RoundPlan, 'generator' | 'weather'> & { twist: string };
  /** Seconds per turn; 0 = untimed (the default for puzzles). */
  turnTimer?: number;
  /** Shots you may fire before the challenge is lost; unset = until the kit runs out. */
  shots?: number;
  stars: StarRule;
  /**
   * A known clear, shot by shot (weapon, angle, power), replayed by the tests so a map or physics
   * change that breaks the puzzle is caught. Target challenges without one must be cleared by
   * the tests' direct-hit solver.
   */
  solution?: readonly (readonly [string, number, number])[];
}

export const CHAPTERS = ['Range', 'Tools of the trade', 'Duels', 'Gauntlet'] as const;

const SMALL = { width: 800, height: 400 } as const;

/** The ladder, in order. Each one opens when the one before it is cleared. */
export const CHALLENGES: readonly Challenge[] = [
  // ── 1 Range: still targets, learn angle, power and wind ──────────────────────────────────
  {
    id: 'range.first-shot',
    chapter: 0,
    name: 'First shot',
    brief: 'Knock out the target across the valley.',
    hint: 'Higher angle drops the shell steeper; more power sends it farther.',
    seed: 101,
    map: { generator: 'gen.hills', ...SMALL },
    you: { x: 140, inventory: { 'weapon.missile': -1 } },
    foes: [{ x: 600, health: 40 }],
    wind: 0,
    stars: { by: 'shots', three: 1, two: 3 },
  },
  {
    id: 'range.over-the-top',
    chapter: 0,
    name: 'Over the top',
    brief: 'The target hides behind the ridge. Lob one over it.',
    hint: 'Go steep: 60° and up clears the ridge.',
    seed: 1,
    map: { generator: 'gen.village', ...SMALL },
    you: { x: 160, inventory: { 'weapon.missile': -1 } },
    foes: [{ x: 640, health: 40 }],
    wind: 0,
    stars: { by: 'shots', three: 1, two: 3 },
  },
  {
    id: 'range.three-cans',
    chapter: 0,
    name: 'Three cans',
    brief: 'Three targets, six missiles.',
    seed: 202,
    map: { generator: 'gen.hills', ...SMALL },
    you: { x: 100, inventory: { 'weapon.missile': 6 } },
    foes: [
      { x: 380, health: 30 },
      { x: 540, health: 30 },
      { x: 700, health: 30 },
    ],
    wind: 0,
    stars: { by: 'shots', three: 3, two: 4 },
  },
  {
    id: 'range.headwind',
    chapter: 0,
    name: 'Headwind',
    brief: 'A steady wind blows in your face. Beat it.',
    hint: 'Into the wind, aim flatter and hit harder.',
    seed: 303,
    map: { generator: 'gen.hills', ...SMALL },
    you: { x: 140, inventory: { 'weapon.missile': -1 } },
    foes: [{ x: 620, health: 40 }],
    wind: -0.008,
    stars: { by: 'shots', three: 1, two: 3 },
  },
  {
    id: 'range.moon-shot',
    chapter: 0,
    name: 'Moon shot',
    brief: 'Low gravity: everything flies twice as far.',
    hint: 'Halve your usual power.',
    seed: 404,
    map: { generator: 'gen.hills', ...SMALL },
    you: { x: 120, inventory: { 'weapon.missile': -1 } },
    foes: [
      { x: 520, health: 30 },
      { x: 690, health: 30 },
    ],
    wind: 0.003,
    twist: { twist: 'Low gravity', gravity: 50 },
    stars: { by: 'shots', three: 2, two: 4 },
  },
  // ── 2 Tools of the trade: special ammo for awkward targets ────────────────────────────────
  {
    id: 'tools.roll-call',
    chapter: 1,
    name: 'Roll call',
    brief: 'The target sits deep in a valley. Two Rollers.',
    hint: 'Land a Roller on the near slope and let it roll down.',
    seed: 202,
    map: { generator: 'gen.hills', ...SMALL },
    you: { x: 100, inventory: { 'weapon.roller': 2 } },
    foes: [{ x: 600, health: 40 }],
    wind: 0,
    stars: { by: 'shots', three: 1, two: 2 },
    solution: [['weapon.roller', 28, 600]],
  },
  {
    id: 'tools.firestorm',
    chapter: 1,
    name: 'Firestorm',
    brief: 'Two targets share a valley. One Napalm, two Baby Missiles.',
    hint: 'Napalm runs downhill: drop it above them.',
    seed: 202,
    map: { generator: 'gen.hills', ...SMALL },
    you: { x: 100, inventory: { 'weapon.napalm': 1, 'weapon.baby-missile': 2 } },
    foes: [
      { x: 570, health: 30 },
      { x: 630, health: 30 },
    ],
    wind: 0,
    stars: { by: 'shots', three: 1, two: 2 },
    solution: [['weapon.napalm', 20, 1000]],
  },
  {
    id: 'tools.bunker',
    chapter: 1,
    name: 'Bunker',
    brief: 'Towers stand in the way. The Bunker Buster goes straight through them.',
    hint: 'The Bunker Buster goes through walls and goes off inside.',
    seed: 7,
    map: { generator: 'gen.city', ...SMALL },
    you: { x: 120, inventory: { 'weapon.bunker-buster': 2, 'weapon.baby-missile': 2 } },
    foes: [{ x: 500, health: 40 }],
    wind: 0,
    stars: { by: 'shots', three: 1, two: 2 },
    solution: [['weapon.bunker-buster', 36, 550]],
  },
  {
    id: 'tools.island-hop',
    chapter: 1,
    name: 'Island hop',
    brief: 'Targets on floating islands. Heat Seekers find them.',
    seed: 11,
    map: { generator: 'gen.islands', ...SMALL },
    you: { x: 120, inventory: { 'weapon.heat-seeker': 3 } },
    foes: [
      { x: 470, health: 40 },
      { x: 680, health: 40 },
    ],
    wind: 0.004,
    stars: { by: 'shots', three: 2, two: 3 },
    solution: [
      ['weapon.heat-seeker', 52, 950],
      ['weapon.heat-seeker', 56, 600],
    ],
  },
  {
    id: 'tools.hopscotch',
    chapter: 1,
    name: 'Hopscotch',
    brief: 'Two targets past the peaks. Skippers hop on along the ground.',
    seed: 5,
    map: { generator: 'gen.lakeland', ...SMALL },
    you: { x: 110, inventory: { 'weapon.skipper': 3 } },
    foes: [
      { x: 560, health: 30 },
      { x: 660, health: 30 },
    ],
    wind: 0,
    stars: { by: 'shots', three: 2, two: 3 },
    solution: [
      ['weapon.skipper', 20, 950],
      ['weapon.skipper', 56, 550],
    ],
  },
  // ── 3 Duels: bots that shoot back ─────────────────────────────────────────────────────────
  {
    id: 'duel.first-blood',
    chapter: 2,
    name: 'First blood',
    brief: 'A Moron bot fires back. Beat it.',
    seed: 505,
    map: { generator: 'gen.hills', ...SMALL },
    you: { x: 150, inventory: { 'weapon.missile': -1, 'weapon.baby-missile': 5 } },
    foes: [{ x: 640, bot: 'ai.moron', inventory: { 'weapon.missile': -1 } }],
    windType: 'perTurn',
    turnTimer: 20,
    stars: { by: 'health', three: 75, two: 40 },
  },
  {
    id: 'duel.sharpshooter',
    chapter: 2,
    name: 'Sharpshooter',
    brief: 'The Shooter rarely misses twice. You start hurt.',
    seed: 606,
    map: { generator: 'gen.village', ...SMALL },
    you: {
      x: 130,
      health: 60,
      inventory: { 'weapon.missile': -1, 'weapon.baby-nuke': 1, 'gear.parachute': 1 },
    },
    foes: [{ x: 660, bot: 'ai.shooter', inventory: { 'weapon.missile': -1 } }],
    windType: 'perTurn',
    turnTimer: 20,
    stars: { by: 'health', three: 50, two: 25 },
  },
  // ── 4 Gauntlet: bots under twists and map events ──────────────────────────────────────────
  {
    id: 'gauntlet.two-on-one',
    chapter: 3,
    name: 'Two on one',
    brief: 'Two Tossers, one of you.',
    seed: 707,
    map: { generator: 'gen.hills', ...SMALL },
    you: {
      x: 400,
      inventory: { 'weapon.missile': -1, 'weapon.frag-shell': 2, 'gear.parachute': 2 },
    },
    foes: [
      { x: 110, bot: 'ai.tosser', inventory: { 'weapon.missile': -1 } },
      { x: 690, bot: 'ai.tosser', inventory: { 'weapon.missile': -1 } },
    ],
    windType: 'perTurn',
    turnTimer: 20,
    stars: { by: 'health', three: 60, two: 30 },
  },
  {
    id: 'gauntlet.gale',
    chapter: 3,
    name: 'Gale',
    brief: 'A gale blows and the Shooter still aims true.',
    seed: 808,
    map: { generator: 'gen.badlands', ...SMALL },
    you: { x: 140, inventory: { 'weapon.missile': -1, 'weapon.heat-seeker': 2 } },
    foes: [{ x: 650, bot: 'ai.shooter', inventory: { 'weapon.missile': -1 } }],
    windType: 'perTurn',
    twist: { twist: 'Gale', wind: 250 },
    turnTimer: 20,
    stars: { by: 'health', three: 60, two: 30 },
  },
  {
    id: 'gauntlet.meteor-night',
    chapter: 3,
    name: 'Meteor night',
    brief: 'Rocks fall from the sky. The Poolshark does not mind.',
    seed: 909,
    map: { generator: 'gen.village', ...SMALL },
    you: {
      x: 150,
      inventory: { 'weapon.missile': -1, 'weapon.mirv': 1, 'gear.shield': 1 },
    },
    foes: [{ x: 640, bot: 'ai.poolshark', inventory: { 'weapon.missile': -1 } }],
    windType: 'perTurn',
    twist: { twist: 'Meteor night', events: ['terrainop.meteor-night'] },
    turnTimer: 20,
    stars: { by: 'health', three: 50, two: 25 },
  },
  {
    id: 'gauntlet.last-stand',
    chapter: 3,
    name: 'Last stand',
    brief: 'The Cyborg never misses by much. Make every shot count.',
    seed: 1010,
    map: { generator: 'gen.hills', ...SMALL },
    you: {
      x: 130,
      inventory: {
        'weapon.missile': -1,
        'weapon.baby-nuke': 1,
        'weapon.heat-seeker': 1,
        'gear.shield': 1,
        'gear.parachute': 1,
      },
    },
    foes: [
      { x: 670, bot: 'ai.cyborg', inventory: { 'weapon.missile': -1, 'weapon.baby-missile': 4 } },
    ],
    windType: 'perTurn',
    turnTimer: 20,
    stars: { by: 'health', three: 50, two: 20 },
  },
];

/** The challenge after `id` in the ladder, or null at the end. */
export function nextChallenge(id: string): Challenge | null {
  const i = CHALLENGES.findIndex((c) => c.id === id);
  return i >= 0 ? (CHALLENGES[i + 1] ?? null) : null;
}

export function challengeById(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

/** Zero for every weapon the mode hands out, so a challenge's kit is all a tank carries. */
function noLoadout(content: ResolvedContent, mode: string): Record<string, number> {
  const m = content.list('mode').find((x) => x.id === mode);
  const out: Record<string, number> = {};
  for (const l of m?.loadout ?? []) out[l.weapon] = 0;
  return out;
}

/** The world a challenge is played in: one round, player 0 is you, targets never take a turn. */
export function challengeOptions(c: Challenge, content: ResolvedContent): WorldOptions {
  const mode = 'mode.classic';
  const empty = noLoadout(content, mode);
  const players = 1 + c.foes.length;
  // you first, then the bots in order; targets are left out, so they never aim
  const turnOrder = [0, ...c.foes.flatMap((f, i) => (f.bot ? [i + 1] : []))];
  const rules: MatchRules = {
    rounds: 1,
    turnTimer: c.turnTimer ?? 0,
    suddenDeath: false,
    windType: c.windType ?? 'constant',
    startingCash: 0,
    openingShop: false,
    birds: true,
    mapEvents: true,
    // the shot budget decides, never the mode's turn cap
    turnCap: 99,
  };
  return {
    seed: c.seed,
    mode,
    players,
    map: c.map,
    tankColumns: [c.you.x, ...c.foes.map((f) => f.x)],
    tanks: [c.you.tank ?? null, ...c.foes.map((f) => f.tank ?? (f.bot ? 'auto' : null))],
    tankSetup: [
      { health: c.you.health, inventory: { ...empty, ...c.you.inventory } },
      ...c.foes.map((f) => ({
        health: f.health,
        inventory: f.inventory ? { ...empty, ...f.inventory } : f.bot ? undefined : empty,
      })),
    ],
    bots: [null, ...c.foes.map((f) => f.bot ?? null)],
    turnOrder,
    rules,
    ...(c.wind !== undefined ? { wind: c.wind } : {}),
    ...(c.weather ? { weather: c.weather } : {}),
    ...(c.twist ? { perRound: [{ ...c.twist, weather: c.weather ?? null }] } : {}),
  };
}

export type ChallengeStatus =
  { state: 'playing' } | { state: 'won'; stars: 1 | 2 | 3 } | { state: 'lost'; reason: string };

/** Stars a cleared challenge earns. */
export function starsFor(c: Challenge, shots: number, healthPct: number): 1 | 2 | 3 {
  const s = c.stars;
  if (s.by === 'shots') return shots <= s.three ? 3 : shots <= s.two ? 2 : 1;
  return healthPct >= s.three ? 3 : healthPct >= s.two ? 2 : 1;
}

/**
 * The referee: fed the world after every frame, it counts your shots and calls the result. It
 * only reads the world, so a challenge plays exactly like any local match.
 */
export class ChallengeRun {
  shots = 0;
  status: ChallengeStatus = { state: 'playing' };
  /** World turn whose shot was counted last (one shot per turn: a turn ends after its shot). */
  private countedTurn = -1;
  private readonly fullHealth: number;

  constructor(
    readonly challenge: Challenge,
    world: World,
  ) {
    this.fullHealth = Math.max(1, world.tanks[0]?.health ?? 1);
  }

  /** Shots left in the budget, or -1 without one. */
  get shotsLeft(): number {
    const b = this.challenge.shots;
    return b === undefined ? -1 : Math.max(0, b - this.shots);
  }

  /** Returns true when the status changed. */
  observe(w: World): boolean {
    if (this.status.state !== 'playing') return false;
    const phase = w.phase;
    if (phase === 'resolve' && w.activePlayer === 0 && w.turn !== this.countedTurn) {
      this.countedTurn = w.turn;
      this.shots++;
    }
    const me = w.tanks[0];
    if (!me) return false;
    const foesLeft = w.tanks.some((t) => t.player !== 0 && t.alive);
    if (!me.alive) return this.set({ state: 'lost', reason: 'Your tank was destroyed.' });
    if (!foesLeft) {
      const pct = Math.round((100 * Math.max(0, me.health)) / this.fullHealth);
      return this.set({ state: 'won', stars: starsFor(this.challenge, this.shots, pct) });
    }
    // only judged between shots, once everything has landed and it is your turn again
    if (phase === 'over') return this.set({ state: 'lost', reason: 'Out of turns.' });
    if (phase !== 'aim' || w.activePlayer !== 0) return false;
    if (this.shotsLeft === 0) return this.set({ state: 'lost', reason: 'Out of shots.' });
    if (me.inventory.every((n) => n === 0))
      return this.set({ state: 'lost', reason: 'Out of ammo.' });
    return false;
  }

  private set(s: ChallengeStatus): boolean {
    this.status = s;
    return true;
  }
}

// ── progress (per device) ────────────────────────────────────────────────────────────────────

const KEY = 'mudders.challenges.v1';

/** Best stars per challenge id (0 or missing = not cleared). */
export type ChallengeProgress = Record<string, number>;

export function loadProgress(): ChallengeProgress {
  try {
    const raw = localStorage.getItem(KEY);
    const p: unknown = raw ? JSON.parse(raw) : {};
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      const out: ChallengeProgress = {};
      for (const [k, v] of Object.entries(p)) if (typeof v === 'number') out[k] = v;
      return out;
    }
  } catch {
    // private mode or bad data
  }
  return {};
}

/** Keeps the best result; returns the updated progress. */
export function recordStars(p: ChallengeProgress, id: string, stars: number): ChallengeProgress {
  const next = { ...p, [id]: Math.max(p[id] ?? 0, stars) };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

/** Stars earned across the ladder (ids no longer in it don't count). */
export function totalStars(p: ChallengeProgress): number {
  return CHALLENGES.reduce((n, c) => n + Math.min(3, p[c.id] ?? 0), 0);
}

/** Open challenges: the first, and every one whose predecessor is cleared. */
export function isUnlocked(p: ChallengeProgress, index: number): boolean {
  if (index <= 0) return true;
  const prev = CHALLENGES[index - 1];
  return prev !== undefined && (p[prev.id] ?? 0) > 0;
}

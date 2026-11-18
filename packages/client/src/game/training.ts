import type { ResolvedContent, WorldOptions } from '@mudders/sim';
import { World, type Tank } from '@mudders/sim';
import { challengeOptions, type Challenge } from './challenges';
import { coach, reportShot, suggestAim, type Coaching, type ShotReport } from './coach';

/**
 * Training mode: endless target practice with a coach. Each range is a fresh small map with you
 * and one still target, built like a solo challenge (`challengeOptions`), so the sim knows
 * nothing about it. Notes: docs/TRAINING.md.
 */

export type TrainingWind = 'calm' | 'steady' | 'changing';

export const TRAINING_WINDS: readonly { id: TrainingWind; label: string }[] = [
  { id: 'calm', label: 'Calm' },
  { id: 'steady', label: 'Steady' },
  { id: 'changing', label: 'Shifting' },
];

/** Maps a range is drawn on: open ground with room for a lob, no roof, no islands. */
const MAPS = [
  'gen.hills',
  'gen.village',
  'gen.badlands',
  'gen.lakeland',
  'gen.glacier',
  'gen.claypits',
  'gen.marsh',
] as const;

const WIDTH = 800;
const HEIGHT = 400;
/** Health of the target: a direct missile hit takes it out, a near miss only dents it. */
export const TARGET_HEALTH = 40;
/** Strongest steady wind, cells/tick² (the classic mode tops out at 0.012). */
const STEADY_MAX = 0.009;

/** Small, fast, seeded: the same seed draws the same range. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** The range a seed draws, as a challenge with no goal beyond the hit. */
export function rangeFor(seed: number, wind: TrainingWind): Challenge {
  const r = rng(seed);
  const map = MAPS[Math.floor(r() * MAPS.length)] ?? 'gen.hills';
  const gap = 260 + Math.floor(r() * 300);
  const near = 70 + Math.floor(r() * (WIDTH - 140 - gap));
  const flip = r() < 0.5;
  const you = flip ? WIDTH - near : near;
  const target = flip ? you - gap : you + gap;
  const strength = 0.002 + r() * (STEADY_MAX - 0.002);
  const sign = r() < 0.5 ? -1 : 1;
  return {
    id: 'training',
    chapter: 0,
    name: 'Training',
    brief: 'Hit the target.',
    seed: 1 + Math.floor(r() * 1_000_000),
    map: { generator: map, width: WIDTH, height: HEIGHT },
    you: { x: you, inventory: { 'weapon.missile': -1 } },
    foes: [{ x: target, health: TARGET_HEALTH }],
    ...(wind === 'calm'
      ? { wind: 0 }
      : wind === 'steady'
        ? { wind: Math.round(sign * strength * 10000) / 10000 }
        : { windType: 'perTurn' as const }),
    stars: { by: 'shots', three: 1, two: 3 },
  };
}

/**
 * A range that can be hit with a plain missile from where you start: tries seeds from `seed`
 * on until one can (a target under a cliff lip, or out of reach, is skipped).
 */
export function trainingRange(
  content: ResolvedContent,
  seed: number,
  wind: TrainingWind,
): { seed: number; options: WorldOptions } {
  for (let i = 0; i < 12; i++) {
    const s = (seed + i * 7919) >>> 0;
    const options = challengeOptions(rangeFor(s, wind), content);
    const w = new World(content, options);
    const me = w.tanks[0];
    if (
      me &&
      suggestAim(w, me, me.weapon, 1, { angle: me.x < (w.tanks[1]?.x ?? 0) ? 45 : 135, power: 600 })
    )
      return { seed: s, options };
  }
  return { seed, options: challengeOptions(rangeFor(seed, wind), content) };
}

/** Where a range stands. */
export type RangeState = 'playing' | 'cleared' | 'lost';

/**
 * The coach's referee for one range: fed the world after every frame, it reads each of your
 * shots as it leaves the barrel (before it changes the ground) and, once it is your turn again,
 * builds the coaching card against the ground and wind you face now.
 */
export class TrainingRun {
  shots = 0;
  state: RangeState = 'playing';
  /** The card for your last shot, or null before the first one and while a shell flies. */
  card: Coaching | null = null;
  /** The last shot hit (direct, or its splash finished the target). */
  lastHit = false;
  readonly history: ShotReport[] = [];
  private pending: ShotReport | null = null;
  private countedTurn = -1;

  /** Returns true when something the card shows changed. */
  observe(w: World): boolean {
    if (this.state !== 'playing') return false;
    const me = w.tanks[0];
    if (!me) return false;
    if (w.phase === 'resolve' && w.activePlayer === 0 && w.turn !== this.countedTurn) {
      this.countedTurn = w.turn;
      this.shots++;
      this.pending = reportShot(w, me, { angle: me.angle, power: me.power, weapon: me.weapon });
      this.card = null;
      return true;
    }
    const foesLeft = w.tanks.some((t) => t.player !== 0 && t.alive);
    if (!me.alive) {
      this.state = 'lost';
      this.card = this.pending ? coach(this.pending, null, this.history) : null;
      if (this.card) {
        this.card.headline = 'Own goal';
        this.card.why.unshift('Your shell came down on your own tank.');
      }
      return true;
    }
    if (!foesLeft) {
      this.state = 'cleared';
      this.lastHit = true;
      const r = this.pending;
      this.card = r ? coach({ ...r, result: 'hit' }, null, this.history) : null;
      if (this.card && r && r.result !== 'hit') {
        this.card.headline = 'Got it!';
        this.card.why = [
          `The splash finished it, ${r.missBy === 0 ? 'right on it' : `${Math.abs(r.missBy)} cells ${r.missBy < 0 ? 'short' : 'long'}`}.`,
        ];
      }
      if (r) this.history.push(r);
      this.pending = null;
      return true;
    }
    if (w.phase === 'aim' && w.activePlayer === 0 && this.pending) {
      const r = this.pending;
      this.pending = null;
      const target = w.tanks[r.target]?.alive
        ? r.target
        : (w.tanks.find((t) => t.player !== 0 && t.alive)?.player ?? r.target);
      const sug = suggestAim(w, me, me.weapon, target, r);
      this.lastHit = r.result === 'hit';
      this.card = coach(r, sug, this.history, windAlong(w, me, target));
      this.history.push(r);
      return true;
    }
    return false;
  }
}

/** The wind now along the line from `me` to `target`, -1 headwind to 1 tailwind. */
export function windAlong(w: World, me: Tank, target: number): number {
  const t = w.tanks[target];
  const dir = t ? Math.sign(t.x - me.x) || 1 : 1;
  const max = w.mode.wind.max * 65536;
  return max > 0 ? Math.max(-1, Math.min(1, (w.windBase / max) * dir)) : 0;
}

const KEY = 'mudders.training.v1';

export interface TrainingPrefs {
  wind: TrainingWind;
  /** Coach card on (it can be folded away to a chip). */
  coach: boolean;
}

export function loadTrainingPrefs(): TrainingPrefs {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (p && typeof p === 'object') {
      const o = p as Record<string, unknown>;
      const wind = TRAINING_WINDS.find((x) => x.id === o.wind)?.id ?? 'steady';
      return { wind, coach: o.coach !== false };
    }
  } catch {
    // private mode or bad data
  }
  return { wind: 'steady', coach: true };
}

export function saveTrainingPrefs(p: TrainingPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

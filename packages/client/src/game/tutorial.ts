import type { ResolvedContent, WorldOptions } from '@mudders/sim';
import type { World } from '@mudders/sim';
import { trainingRange } from './training';

/**
 * First-match tutorial: a one-minute guided match against a still target, built like a training
 * range (so the sim knows nothing about it) but opening with the shop. A step card walks through
 * shop, aim, wind, fire, drive and the hit; each step ends on what the player does, not on a
 * timer. Client only.
 */

export type TutorialStep =
  'shop' | 'aim' | 'wind' | 'fire' | 'flying' | 'drive' | 'finish' | 'done';

/** The order steps are counted in (for "Step 2 of 6"). */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  'shop',
  'aim',
  'wind',
  'fire',
  'drive',
  'finish',
];

/** Range seed: open ground, a steady light wind, target in reach of a plain missile. */
const SEED = 4242;
/** Cash for the tutorial's shop: enough for a few weapons to try. */
export const TUTORIAL_CASH = 5000;

export function tutorialOptions(content: ResolvedContent): WorldOptions {
  const { options } = trainingRange(content, SEED, 'steady');
  return {
    ...options,
    rules: {
      ...options.rules,
      openingShop: true,
      startingCash: TUTORIAL_CASH,
      // untimed: the shop waits for Ready (a long timer, since 0 would close it at once)
      shopTimer: 600,
      turnTimer: 0,
    },
  };
}

/**
 * Follows the match and moves the step on. `observe` is fed the world after every tick and says
 * whether the step changed; `next` moves on by hand (the wind step's "Got it", "Skip").
 */
export class TutorialRun {
  step: TutorialStep = 'shop';
  shots = 0;
  /** The player drove at some point (the done card mentions driving if not). */
  drove = false;
  private aim0: { angle: number; power: number } | null = null;
  private x0 = -1;
  private firedTurn = -1;
  private windSeen = false;

  observe(w: World): boolean {
    const me = w.tanks[0];
    if (!me) return false;
    if (me.driving !== 0 || (this.x0 >= 0 && me.x !== this.x0 && w.phase === 'aim'))
      this.drove = true;
    if (w.phase === 'resolve' && w.activePlayer === 0 && w.turn !== this.firedTurn) {
      this.firedTurn = w.turn;
      this.shots++;
    }
    const foesLeft = w.tanks.some((t) => t.player !== 0 && t.alive);
    if (!foesLeft && this.step !== 'done' && w.phase !== 'resolve') return this.go('done');
    switch (this.step) {
      case 'shop':
        if (w.phase === 'aim') {
          this.aim0 = { angle: me.angle, power: me.power };
          return this.go('aim');
        }
        return false;
      case 'aim':
        if (this.aim0 && (me.angle !== this.aim0.angle || me.power !== this.aim0.power)) {
          this.windSeen = true;
          return this.go('wind');
        }
        if (w.phase === 'resolve') return this.go('flying');
        return false;
      case 'wind':
      case 'fire':
        if (w.phase === 'resolve') return this.go('flying');
        return false;
      case 'flying':
        if (w.phase === 'aim' && w.activePlayer === 0) {
          this.x0 = me.x;
          if (!this.windSeen) {
            this.windSeen = true;
            return this.go('wind');
          }
          return this.go(this.drove ? 'finish' : 'drive');
        }
        return false;
      case 'drive':
        if (this.drove) return this.go('finish');
        if (w.phase === 'resolve') return this.go('flying');
        return false;
      case 'finish':
      case 'done':
        return false;
    }
  }

  /** Move on by hand. */
  next(): void {
    if (this.step === 'wind')
      this.step = this.shots > 0 ? (this.drove ? 'finish' : 'drive') : 'fire';
    else if (this.step === 'drive') this.step = 'finish';
  }

  private go(s: TutorialStep): boolean {
    if (s === this.step) return false;
    this.step = s;
    return true;
  }
}

const KEY = 'mudders.tutorial.v1';

/** The tutorial was played to the end on this device. */
export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return false;
  }
}

export function markTutorialDone(): void {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    // private mode
  }
}

import { loadContent } from '@mudders/content';
import { AI_ACE, World, type ResolvedContent } from '@mudders/sim';

/**
 * Practice blasts on a small hidden map, a little at a time while nothing else is going on.
 *
 * The first big blast of a session used to stutter however fast the sim was: the browser had
 * never run the heavy paths (a hillside coming down, thrown earth landing, a tower falling), so
 * it ran them on unoptimized code and threw away what it had optimized the moment it met them.
 * Measured in V8, an Ion Cannon's worst tick is 43 ms the first time and 8 ms from the second
 * on. These shots walk those paths before a match does, so the first real one is already fast
 * (17 ms). The last shot is a small one answered by a bot, for the bot's planning. Nothing of it
 * is shown or kept, and a match never waits for it.
 */
const SHOTS = ['weapon.ion-cannon', 'weapon.nuke', 'weapon.superstorm', 'weapon.missile'];
/** The bot that answers the last shot. */
const BOT = 'ai.shooter';
/** Longest the bot gets to answer. */
const MAX_REPLY = 600;
/** Map width in cells (half as high): the smallest that still walks the paths a full map does. */
const SIZE = 480;
/** Longest a shot is followed. */
const MAX_TICKS = 900;
/** Longest a practice world gets to reach its first turn. */
const MAX_WAIT = 400;

export class SimWarmup {
  private shot = 0;
  private world: World | null = null;
  private fired = false;
  /** The practice shot has landed, and a bot is answering it. */
  private reply = false;
  private ticks = 0;
  /** Ticks run so far, over all shots. */
  total = 0;
  /** The bot got to answer the last shot. */
  botFired = false;

  constructor(private readonly content: ResolvedContent) {}

  get done(): boolean {
    return this.shot >= SHOTS.length;
  }

  /** One small piece of work: a tick of the practice world, or setting the next one up. */
  step(): void {
    const weapon = SHOTS[this.shot];
    if (weapon === undefined) return;
    if (!this.world) {
      if (!this.content.has(weapon)) {
        this.shot++;
        return;
      }
      const bot = this.shot === SHOTS.length - 1 && this.content.has(BOT);
      this.world = new World(this.content, {
        seed: 3 + this.shot,
        mode: 'mode.classic',
        players: 2,
        map: { generator: 'gen.village', width: SIZE, height: SIZE >> 1 },
        weather: 'weather.rain',
        tankSetup: [{ inventory: { [weapon]: 1 } }, { inventory: { [weapon]: 1 } }],
        turnOrder: [0, 1],
        ...(bot ? { bots: [null, BOT], botSkills: [null, AI_ACE] } : {}),
      });
      this.fired = false;
      this.reply = false;
      this.ticks = 0;
      return;
    }
    const w = this.world;
    if (!this.fired && w.phase === 'aim') {
      const p = w.activePlayer;
      const tank = w.tanks[p];
      w.applyInput(p, { type: 'selectWeapon', weapon });
      w.applyInput(p, {
        type: 'aim',
        angle: tank && tank.x >= SIZE >> 1 ? 120 : 60,
        power: 300,
      });
      w.applyInput(p, { type: 'fire' });
      this.fired = true;
      this.ticks = 0;
    }
    w.step();
    this.total++;
    this.ticks++;
    let over = this.fired
      ? this.ticks >= MAX_TICKS || (this.ticks > 5 && w.phase !== 'resolve')
      : this.ticks >= MAX_WAIT;
    if (
      over &&
      this.fired &&
      !this.reply &&
      w.phase === 'aim' &&
      w.options.bots?.[w.activePlayer]
    ) {
      // the bot's turn: it plans, fires, and that shot is followed too
      this.reply = true;
      this.ticks = 0;
      over = false;
    } else if (this.reply) {
      if (w.phase === 'resolve') this.botFired = true;
      over =
        this.ticks >= MAX_REPLY || (this.ticks > 5 && w.phase !== 'aim' && w.phase !== 'resolve');
      if (!over && w.phase === 'aim' && !w.options.bots?.[w.activePlayer]) over = true;
    }
    if (over) {
      this.world = null;
      this.shot++;
    }
  }
}

/** Longest one slice of practice runs, when the browser does not say how long it is idle for. */
const SLICE_MS = 4;
/** How long practice stays out of the way after a match was busy resolving a shot. */
const HOLD_MS = 1000;

let started = false;
let holdUntil = 0;

/** A match is resolving a shot: practice waits, so it never takes time from a real blast. */
export function holdSimWarmup(now: number): void {
  holdUntil = now + HOLD_MS;
}

/** Start the practice blasts in the background (once per page; safe to call again). */
export function startSimWarmup(): void {
  if (started) return;
  started = true;
  const warm = new SimWarmup(loadContent());
  const idle =
    typeof requestIdleCallback === 'function'
      ? (run: (left: () => number) => void) =>
          requestIdleCallback((d) => run(() => d.timeRemaining()), { timeout: 2000 })
      : (run: (left: () => number) => void) => setTimeout(() => run(() => SLICE_MS), 50);
  const slice = (left: () => number): void => {
    const t0 = performance.now();
    if (t0 >= holdUntil) {
      do warm.step();
      while (!warm.done && performance.now() - t0 < SLICE_MS && left() > 1);
    }
    if (!warm.done) idle(slice);
    // (shows in a performance trace, and tells a test the practice is over)
    else performance.mark('sim-warmup-done');
  };
  idle(slice);
}

/**
 * Slow-mo finisher: when the blow that decides a round lands, the next couple of seconds play in
 * slow motion (a short near-freeze, then quarter speed, then an ease back to real time).
 *
 * Presentation only. It scales how much wall-clock time the frame loop feeds the match, so the
 * sim steps the same ticks in the same order and just takes longer to get there. Every peer sees
 * the same deciding tick (lockstep), so every peer slows down together: the host hands out tick
 * permits more slowly and the guests, slowed too, keep pace. Nothing here touches the sim.
 */

/** Time curve, in wall-clock ms since the deciding blow. */
export const SLOWMO = {
  /** A beat of near-freeze on the hit itself. */
  freezeMs: 120,
  freezeScale: 0.06,
  /** Then slow motion… */
  slowMs: 1800,
  slowScale: 0.25,
  /** …easing back to real time. */
  easeMs: 600,
} as const;

/** A frame that simulated more than this many ticks (a guest catching up, a reload) never triggers. */
const MAX_JUMP = 16;

/** Time scale `ms` after the deciding blow (1 = real time). */
export function slowMoScale(ms: number): number {
  if (ms < 0) return 1;
  if (ms < SLOWMO.freezeMs) return SLOWMO.freezeScale;
  let t = ms - SLOWMO.freezeMs;
  if (t < SLOWMO.slowMs) return SLOWMO.slowScale;
  t -= SLOWMO.slowMs;
  if (t >= SLOWMO.easeMs) return 1;
  const k = t / SLOWMO.easeMs;
  return SLOWMO.slowScale + (1 - SLOWMO.slowScale) * k * k;
}

/** The bits of a World the finisher watches. */
export interface SlowMoWorld {
  readonly tick: number;
  readonly round: number;
  readonly tanks: readonly { readonly alive: boolean; readonly team: number }[];
}

/** Teams (players, in a free-for-all) with a tank still alive. */
export function aliveSides(tanks: SlowMoWorld['tanks']): number {
  let n = 0;
  let i = 0;
  for (const t of tanks) {
    if (t.alive) {
      let seen = false;
      for (let j = 0; j < i && !seen; j++) {
        const o = tanks[j];
        seen = o !== undefined && o.alive && o.team === t.team;
      }
      if (!seen) n++;
    }
    i++;
  }
  return n;
}

export class SlowMo {
  /** Off: never triggers (the player's setting). */
  enabled = true;
  private round = -1;
  private sides = -1;
  private tick = -1;
  /** Wall-clock ms since the deciding blow, or -1 when running in real time. */
  private since = -1;

  get active(): boolean {
    return this.since >= 0;
  }

  /**
   * Time scale for a frame of `dtMs` wall-clock ms; the caller feeds the match `dtMs * scale`.
   * Advances the finisher's own clock.
   */
  next(dtMs: number): number {
    if (this.since < 0) return 1;
    const s = slowMoScale(this.since);
    this.since += dtMs;
    if (s >= 1) this.since = -1;
    return s;
  }

  /** Look at the world after a frame's ticks: did the last enemy just fall? */
  observe(w: SlowMoWorld): void {
    const sides = aliveSides(w.tanks);
    const continuous =
      w.round === this.round && w.tick >= this.tick && w.tick - this.tick <= MAX_JUMP;
    if (continuous && this.enabled && this.sides >= 2 && sides <= 1) this.since = 0;
    this.round = w.round;
    this.sides = sides;
    this.tick = w.tick;
  }

  /** Back to real time at once (setting switched off, match left). */
  cancel(): void {
    this.since = -1;
  }
}

import type { EffectEvent, EntityView, RenderSnapshot } from '@mudders/shared';

/**
 * Impact feel (§2a "juice"): how hard a blast shakes the screen, and how long the picture holds
 * still on a big hit (hit-stop). Purely presentational: the sim never sees any of it. A hold only
 * slows how fast this client feeds wall-clock time to its sim, so every peer still computes the
 * same ticks, and the capture CLI plays the same holds from the same snapshots.
 */

/** Shortest and longest screen shake, in ticks. */
export const SHAKE_MIN = 14;
export const SHAKE_MAX = 40;

/** Peak shake in map cells for a blast of `radius` cells: a pop barely moves, a nuke rocks. */
export function blastShake(radius: number, strength = 1): number {
  if (strength <= 0) return 0;
  return Math.max(0, Math.min(10, radius / 6 - 1)) * Math.min(1.5, strength);
}

/** How long a shake of peak `amp` cells rings: big ones roll on longer. */
export function shakeTicks(amp: number): number {
  return Math.max(SHAKE_MIN, Math.min(SHAKE_MAX, Math.round(10 + amp * 3)));
}

/** Hit-stop for a blast of `radius` cells, in ticks (60 Hz). Small pops never hold. */
export function blastHold(radius: number, strength = 1): number {
  if (strength <= 0 || radius < 20) return 0;
  return Math.min(MAX_HOLD, Math.round((radius - 14) / 6));
}

/** Longest single hold: 150 ms, so even a nuke is a beat, not a pause. */
export const MAX_HOLD = 9;
/** A tank caught inside the blast adds this much. */
export const TANK_HIT_HOLD = 2;
/** A tank blowing up. */
export const TANK_DEATH_HOLD = 6;
/**
 * After a hold starts, later hits within this many ticks only hold again if they are bigger.
 * Keeps a MIRV, a meteor shower or a gunpowder chain from stuttering.
 */
export const HOLD_COOLDOWN = 24;

const STEP_MS = 1000 / 60;

/** Hold in ticks that one effect event asks for, given the tanks on the map. */
export function eventHold(e: EffectEvent, entities: readonly EntityView[]): number {
  if (e.type === 'tankDeath') return TANK_DEATH_HOLD;
  if (e.type !== 'flash') return 0;
  const strength = e.params.strength ?? 1;
  let hold = blastHold(e.radius, strength);
  if (strength > 0 && e.radius >= 8) {
    const r2 = e.radius * e.radius;
    for (const t of entities) {
      if (t.kind !== 'tank' || t.health <= 0) continue;
      const dx = t.x - e.x;
      const dy = t.y - 4 - e.y;
      if (dx * dx + dy * dy <= r2) {
        hold = Math.max(hold, Math.min(MAX_HOLD, hold + TANK_HIT_HOLD));
        break;
      }
    }
  }
  return hold;
}

/**
 * Hit-stop clock for one view. Feed it every snapshot in tick order; the frame loop asks it how
 * much wall-clock time to hand the sim (none while holding), and the renderer gets `held`, the
 * ticks held so far, so shakes keep moving while the picture is frozen.
 */
export class HitStop {
  /** Ticks of hold still to play. */
  private left = 0;
  /** Size of the hold that started most recently, and when (sim tick). */
  private lastSize = 0;
  private lastTick = -1000;
  /** Total ticks held since the match started (presentation time minus sim time). */
  held = 0;

  constructor(public enabled = true) {}

  get holding(): boolean {
    return this.left > 0;
  }

  /** Read one snapshot's events. Returns the hold in ticks it starts (0 = none). */
  feed(s: RenderSnapshot): number {
    if (!this.enabled || s.effectEvents.length === 0) return 0;
    let want = 0;
    for (const e of s.effectEvents) want = Math.max(want, eventHold(e, s.entities));
    if (want <= 0) return 0;
    if (s.tick - this.lastTick < HOLD_COOLDOWN && want <= this.lastSize) return 0;
    this.lastSize = want;
    this.lastTick = s.tick;
    const add = Math.max(0, want - this.left);
    this.left = Math.max(this.left, want);
    return add;
  }

  /**
   * Spend wall-clock `dtMs` of this frame: the part that falls inside a hold is eaten (and added
   * to `held`), the rest goes to the sim.
   */
  take(dtMs: number): number {
    if (this.left <= 0 || dtMs <= 0) return dtMs;
    const ticks = dtMs / STEP_MS;
    const eat = Math.min(ticks, this.left);
    this.left -= eat;
    this.held += eat;
    if (this.left < 1e-6) this.left = 0;
    return (ticks - eat) * STEP_MS;
  }

  /** Fixed-step version for the capture CLI: hold `ticks` more ticks of presentation time. */
  skip(ticks: number): void {
    const eat = Math.min(ticks, this.left);
    this.left -= eat;
    this.held += eat;
  }
}

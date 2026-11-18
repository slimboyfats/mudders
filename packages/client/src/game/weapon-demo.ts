import type { RenderSnapshot } from '@mudders/shared';
import { FP, World, type ResolvedContent } from '@mudders/sim';
import type { SnapshotStream } from '../render';

/**
 * The shop's weapon preview: one shot of a weapon on a small map, played on a loop.
 *
 * It runs the real sim (not a recorded clip), so a preview always shows what the weapon does in
 * this build, and costs nothing until it is opened. Each loop is a fresh world. To the renderer
 * the loops look like rounds of one match: ticks keep counting up, the turn number jumps a
 * round's worth, and the first snapshot of a loop carries the whole map. That way one mounted
 * renderer plays every loop and every weapon the player steps to, and nothing is compiled again.
 */

/** Map size in cells: small, so a blast fills the picture and the sim stays cheap on a phone. */
export const DEMO_W = 320;
export const DEMO_H = 160;
/** Shooter and target columns, either side of the middle, clear of the edge walls. */
const SHOOTER = 76;
const TARGET = 244;
/** Same hills every time. */
const SEED = 4242;
/** Ticks before the shot, so the picture shows the tanks standing first. */
const LEAD = 30;
/** Longest a shot is followed (turn end waits for the world to be still, at most 4 s). */
const MAX_TICKS = 1200;
/** Ticks the settled result is shown before the next loop. */
const HOLD = 70;
/** Turn numbers a renderer reads as one round (`Math.floor(turn / 1000)`). */
const ROUND = 1000;

export interface DemoAim {
  angle: number;
  power: number;
}

/** A world with the shooter on the left holding the weapon, the target on the right. */
function demoWorld(content: ResolvedContent, weapon: string): World {
  const w = new World(content, {
    seed: SEED,
    mode: 'mode.classic',
    players: 2,
    map: { generator: 'gen.hills', width: DEMO_W, height: DEMO_H },
    tankColumns: [SHOOTER, TARGET],
    tankSetup: [{ inventory: { [weapon]: -1 } }, { health: 100 }],
    turnOrder: [0],
    wind: 0,
    rules: { turnTimer: 0, suddenDeath: false, rounds: 1, turnCap: 1000 },
  });
  w.applyInput(0, { type: 'selectWeapon', weapon });
  return w;
}

/**
 * Angle and power that put the first impact on the target, through the sim's own predictor
 * (the bots' tracer: exact for the first impact, no closed-form ballistics). Steep and flat
 * angles are tried so beams, which fly straight whatever the power, find their line too.
 */
export function solveDemoAim(w: World): DemoAim {
  const me = w.tanks[0];
  const target = w.tanks[1];
  if (!me || !target) return { angle: 55, power: 500 };
  let best = { angle: 55, power: 500, err: Infinity };
  for (const angle of [55, 45, 65, 35, 72, 25, 80, 15, 8]) {
    let lo = 40;
    let hi = 1000;
    for (let it = 0; it < 12 && hi - lo > 1; it++) {
      const mid = (lo + hi) >> 1;
      const p = w.predict(me, me.weapon, angle, mid);
      const err = p.tank === 1 ? 0 : Math.abs(p.x - target.x);
      if (err < best.err) best = { angle, power: mid, err };
      if (!p.landed && p.x <= 0) hi = mid;
      else if (p.x < target.x) lo = mid;
      else hi = mid;
    }
    if (best.err <= 2) break;
  }
  if (best.err > 2) {
    // beams and rails fly straight: sweep the barrel across instead
    for (let angle = 2; angle <= 88 && best.err > 0; angle++) {
      const p = w.predict(me, me.weapon, angle, 500);
      const err = p.tank === 1 ? 0 : Math.abs(p.x - target.x);
      if (err < best.err) best = { angle, power: 500, err };
    }
  }
  return { angle: best.angle, power: best.power };
}

export class WeaponDemo implements SnapshotStream {
  world: World;
  private listeners: ((s: RenderSnapshot) => void)[] = [];
  private aim: DemoAim | null = null;
  /** Ticks into this loop. */
  private t = 0;
  /** Ticks of all earlier loops, added to each snapshot's own so time only moves forward. */
  private base = 0;
  /** Loops played (the "round" the renderer sees). */
  loop = 0;
  private fired = false;
  private triggered = false;
  /** The shot is over at this tick of the loop (then HOLD more ticks are shown). */
  private doneAt = -1;

  constructor(
    readonly content: ResolvedContent,
    private weapon: string,
  ) {
    this.world = demoWorld(content, weapon);
  }

  /** Show another weapon: the next loop starts at once, with that weapon. */
  setWeapon(weapon: string): void {
    if (weapon === this.weapon) return;
    this.weapon = weapon;
    this.aim = null;
    this.restart();
  }

  subscribe(fn: (s: RenderSnapshot) => void): () => void {
    this.listeners.push(fn);
    fn(this.stamp(this.world.snapshot(), true));
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** Where this loop's shot is: waiting, in the air, or over and on show. */
  get stage(): 'lead' | 'shot' | 'hold' {
    return !this.fired ? 'lead' : this.doneAt < 0 ? 'shot' : 'hold';
  }

  /** Sim ticks since the preview opened (for `Renderer.render`). */
  get tick(): number {
    return this.base + this.world.tick;
  }

  private stamp(s: RenderSnapshot, full: boolean): RenderSnapshot {
    const all = { x: 0, y: 0, w: s.width, h: s.height };
    return {
      ...s,
      tick: s.tick + this.base,
      turn: s.turn + this.loop * ROUND,
      ...(full ? { dirtyRects: [all], gasRect: all } : {}),
    };
  }

  /** One sim tick, published to the renderer. */
  step(): void {
    const w = this.world;
    if (!this.fired && this.t >= LEAD && w.phase === 'aim') {
      this.aim ??= solveDemoAim(w);
      w.applyInput(0, { type: 'aim', angle: this.aim.angle, power: this.aim.power });
      w.applyInput(0, { type: 'fire' });
      this.fired = true;
    } else if (this.fired && !this.triggered && w.commandable() === 0) {
      // press-to-trigger shells (DROP!): let go once the shell is over the target
      const target = w.tanks[1];
      const shell = w.projectiles.find((p) => p.alive && p.owner === 0);
      if (target && shell && Math.abs(Math.floor(shell.x / FP) - target.x) < 10) {
        w.applyInput(0, { type: 'fire' });
        this.triggered = true;
      }
    }
    const ticks = this.t - LEAD;
    if (this.fired && this.doneAt < 0 && ticks > 5 && (w.phase !== 'resolve' || ticks > MAX_TICKS))
      this.doneAt = this.t;
    if (this.doneAt >= 0 && this.t - this.doneAt >= HOLD) {
      this.restart();
      return;
    }
    w.step();
    this.t++;
    const s = this.stamp(w.snapshot(), false);
    for (const l of this.listeners) l(s);
  }

  /** A fresh world for the next loop, sent whole so the renderer starts the "round" over. */
  private restart(): void {
    this.base += this.world.tick + 1;
    this.loop++;
    this.t = 0;
    this.fired = false;
    this.triggered = false;
    this.doneAt = -1;
    this.world = demoWorld(this.content, this.weapon);
    const s = this.stamp(this.world.snapshot(), true);
    for (const l of this.listeners) l(s);
  }
}

import type { Input, NetSetup, PeerMessage, PeerStart, TimedInput } from '@mudders/shared';
import { World, type ResolvedContent } from '@mudders/sim';
import { MAX_STEPS, SimMatch, STEP_MS } from '../game/match';
import { toWorldOptions } from '../game/setup';
import type { Link } from './link';

/**
 * Host-authoritative lockstep (§6.3). The sim is deterministic, so peers exchange only inputs:
 *
 * - Every input, the host's own and each guest's, is queued at the host. Before simulating tick
 *   `t` the host stamps the queue with `t`, applies it and appends it to the match log.
 * - The host sends guests `tick { upTo, inputs }`: the inputs it just stamped plus permission to
 *   simulate every tick before `upTo`. Guests never run ahead of that, so they never need to roll
 *   back; they trail the host by about half a round trip, which a turn-based game hides easily.
 * - Every `HASH_EVERY` ticks each guest reports its state hash; on a mismatch the host sends the
 *   seed, setup and the whole input log and the guest re-simulates from scratch (§6.3 "re-sync").
 * - A guest that drops and comes back says which tick it reached; the host re-sends the log from
 *   there (or the whole log after a reload) — §6.1 mobile reconnect.
 */
export const HASH_EVERY = 120;
/** With no inputs to send, the host still advances guests every this many ticks (20 Hz). */
export const FLUSH_EVERY = 3;
/** A guest this many ticks behind its permit catches up faster than real time. */
export const CATCHUP_LAG = 12;
/** Most ticks a guest simulates in one frame while catching up. */
export const CATCHUP_MAX = 120;
/** A guest sends aim changes at most this often (ms); the last aim always goes out. */
export const AIM_INTERVAL_MS = 50;
/** Hash value a guest sends to ask for a resync (it saw an input stamped in its past). */
export const RESYNC = 'resync';

export interface StartInfo {
  seed: number;
  setup: NetSetup;
  mode: string;
}

export function netWorldOptions(start: StartInfo) {
  return { ...toWorldOptions(start.setup, start.seed), mode: start.mode };
}

/** The host's side: runs the authoritative world and feeds every guest. */
export class HostMatch extends SimMatch {
  readonly log: TimedInput[] = [];
  /** Resyncs sent because a guest's hash disagreed. */
  desyncs = 0;
  onDesync: ((player: number) => void) | null = null;
  private queue: { player: number; action: Input }[] = [];
  private outgoing: TimedInput[] = [];
  private readonly guests = new Map<number, Link>();
  private readonly hashes = new Map<number, string>();
  private acc = 0;

  constructor(
    content: ResolvedContent,
    readonly start: StartInfo,
    /** The host's own player index. */
    readonly me: number,
  ) {
    super(content, netWorldOptions(start));
  }

  /** The host's own input (from the UI). */
  input(player: number, action: Input): void {
    if (player === this.me) this.submit(player, action);
  }

  /** Queue an input for the next tick. Consecutive aims by the same player collapse into one. */
  submit(player: number, action: Input): void {
    const last = this.queue[this.queue.length - 1];
    if (action.type === 'aim' && last?.player === player && last.action.type === 'aim') {
      last.action = action;
      return;
    }
    this.queue.push({ player, action });
  }

  advance(dtMs: number): number {
    this.acc += Math.min(dtMs, STEP_MS * MAX_STEPS);
    let n = 0;
    while (this.acc >= STEP_MS && n < MAX_STEPS) {
      this.stepOnce();
      this.acc -= STEP_MS;
      n++;
    }
    return this.world.tick + this.acc / STEP_MS;
  }

  stepOnce(): void {
    const t = this.world.tick;
    for (const q of this.queue) {
      const ti: TimedInput = { t, player: q.player, action: q.action };
      this.world.applyInput(q.player, q.action);
      this.log.push(ti);
      this.outgoing.push(ti);
    }
    this.queue = [];
    this.world.step();
    this.publish();
    const now = this.world.tick;
    if (now % HASH_EVERY === 0) {
      this.hashes.set(now, this.world.hash());
      this.hashes.delete(now - HASH_EVERY * 30);
    }
    if (this.outgoing.length > 0 || now % FLUSH_EVERY === 0) this.flush();
  }

  /** Send stamped inputs and the new permit to every connected guest. */
  flush(): void {
    const msg: PeerMessage = { type: 'tick', upTo: this.world.tick, inputs: this.outgoing };
    for (const link of this.guests.values()) link.send(msg);
    this.outgoing = [];
  }

  /**
   * A guest's link is (re)connected. `haveTick` is the last tick it simulated, or -1 when it has
   * no world (first start, or a reload): then it gets the whole match to re-simulate.
   */
  attach(player: number, link: Link, haveTick: number): void {
    this.flush();
    this.guests.set(player, link);
    if (haveTick < 0 || haveTick > this.world.tick) {
      link.send(this.startMessage(player));
    } else {
      link.send({
        type: 'tick',
        upTo: this.world.tick,
        inputs: this.log.filter((i) => i.t >= haveTick),
      });
    }
  }

  detach(player: number): void {
    this.guests.delete(player);
  }

  connected(player: number): boolean {
    return this.guests.has(player);
  }

  startMessage(player: number): PeerStart {
    return {
      type: 'start',
      ...this.start,
      you: player,
      inputs: this.log,
      upTo: this.world.tick,
    };
  }

  /** Game messages from a guest (the session layer routes lobby/ping messages elsewhere). */
  handle(player: number, msg: PeerMessage): void {
    if (msg.type === 'input') {
      this.submit(player, msg.action);
    } else if (msg.type === 'hash') {
      const mine = this.hashes.get(msg.t);
      if (msg.h === RESYNC || (mine !== undefined && mine !== msg.h)) {
        this.desyncs++;
        this.onDesync?.(player);
        this.flush();
        this.guests.get(player)?.send(this.startMessage(player));
      }
    }
  }
}

/** A guest's side: simulates only what the host has permitted, with the host's inputs. */
export class GuestMatch extends SimMatch {
  you: number;
  upTo: number;
  /** Times the world was rebuilt from the host's log (desync or rejoin after a reload). */
  rebuilds = 0;
  private pending: TimedInput[] = [];
  private head = 0;
  private acc = 0;
  private aimStash: Input | null = null;
  private sinceAim = AIM_INTERVAL_MS;
  private askedResync = false;
  private start: StartInfo;

  constructor(
    content: ResolvedContent,
    start: PeerStart,
    /** Sends to the host; replaced when the link reconnects. */
    public send: (msg: PeerMessage) => void,
  ) {
    super(content, netWorldOptions(start));
    this.start = { seed: start.seed, setup: start.setup, mode: start.mode };
    this.you = start.you;
    this.upTo = 0;
    this.load(start, false);
  }

  /** Ticks the host has permitted that this guest has not simulated yet. */
  get lag(): number {
    return this.upTo - this.world.tick;
  }

  /** (Re)build the world from a start message and re-simulate its log up to its permit. */
  load(start: PeerStart, rebuild = true): void {
    if (rebuild) {
      this.world = new World(this.content, netWorldOptions(start));
      this.start = { seed: start.seed, setup: start.setup, mode: start.mode };
      this.rebuilds++;
    }
    this.you = start.you;
    this.pending = start.inputs.slice();
    this.head = 0;
    this.upTo = start.upTo;
    this.askedResync = false;
    // fast-forward without a snapshot per tick; the renderer gets one full map at the end
    while (this.world.tick < this.upTo) this.simulate(false);
    this.publish(true);
  }

  /**
   * The link came back: forget queued inputs (the host re-sends everything from our tick) and
   * return the `haveTick` to put in the join message.
   */
  resumeFrom(): number {
    this.pending = [];
    this.head = 0;
    return this.world.tick;
  }

  handle(msg: PeerMessage): void {
    if (msg.type === 'tick') {
      for (const i of msg.inputs) this.pending.push(i);
      if (msg.upTo > this.upTo) this.upTo = msg.upTo;
    } else if (msg.type === 'start') {
      this.load(msg);
    }
  }

  input(player: number, action: Input): void {
    if (player !== this.you) return;
    if (action.type === 'aim') {
      if (this.sinceAim >= AIM_INTERVAL_MS) {
        this.sinceAim = 0;
        this.send({ type: 'input', action });
      } else {
        this.aimStash = action;
      }
      return;
    }
    this.flushAim();
    this.send({ type: 'input', action });
  }

  private flushAim(): void {
    if (!this.aimStash) return;
    this.send({ type: 'input', action: this.aimStash });
    this.aimStash = null;
    this.sinceAim = 0;
  }

  advance(dtMs: number): number {
    this.sinceAim += dtMs;
    if (this.aimStash && this.sinceAim >= AIM_INTERVAL_MS) this.flushAim();
    this.acc += Math.min(dtMs, STEP_MS * MAX_STEPS);
    let budget = Math.floor(this.acc / STEP_MS);
    if (budget > MAX_STEPS) budget = MAX_STEPS;
    if (this.lag > CATCHUP_LAG) budget = Math.min(this.lag, CATCHUP_MAX);
    const steps = Math.min(budget, this.lag);
    for (let i = 0; i < steps; i++) this.stepOnce();
    this.acc -= steps * STEP_MS;
    // starved (waiting for the host): don't bank time to burst through later
    if (this.acc > STEP_MS) this.acc = STEP_MS;
    if (this.acc < 0) this.acc = 0;
    return this.world.tick + (this.lag > 0 ? this.acc / STEP_MS : 0);
  }

  /** Simulate one permitted tick. Returns false when waiting for the host. */
  stepOnce(): boolean {
    if (this.world.tick >= this.upTo) return false;
    this.simulate(true);
    return true;
  }

  private simulate(publish: boolean): void {
    const t = this.world.tick;
    while (this.head < this.pending.length) {
      const i = this.pending[this.head]!;
      if (i.t > t) break;
      this.head++;
      if (i.t < t) {
        // stamped in our past: we are out of step with the host
        this.requestResync();
        continue;
      }
      this.world.applyInput(i.player, i.action);
    }
    if (this.head > 256) {
      this.pending = this.pending.slice(this.head);
      this.head = 0;
    }
    this.world.step();
    if (publish) this.publish();
    const now = this.world.tick;
    if (publish && now % HASH_EVERY === 0) {
      this.send({ type: 'hash', t: now, h: this.world.hash() });
    }
  }

  requestResync(): void {
    if (this.askedResync) return;
    this.askedResync = true;
    this.send({ type: 'hash', t: this.world.tick, h: RESYNC });
  }

  /** The setup this match was started from (for a rejoin after a reload). */
  get startInfo(): StartInfo {
    return this.start;
  }
}

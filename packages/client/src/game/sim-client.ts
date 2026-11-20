import type { Input, PeerMessage, PeerStart, RenderSnapshot } from '@mudders/shared';
import type { ResolvedContent, WorldOptions } from '@mudders/sim';
import type { Link } from '../net/link';
import type { StartInfo } from '../net/lockstep';
import { MAX_STEPS, STEP_MS, type GameMatch, type HudState, type SimPerf } from './match';
import {
  SnapshotMirror,
  type FromSim,
  type MatchSpec,
  type RemoteView,
  type TickPacket,
  type ToSim,
} from './sim-wire';

/**
 * The page's side of the sim worker. `RemoteMatch` looks like any match to the UI (`GameMatch`),
 * but its World lives in the worker: inputs and wall-clock time are posted over, tick packets come
 * back and are patched into a copy of the map the renderer reads.
 *
 * Timing. Each frame the page posts the time that passed and draws what it has: the ticks the
 * worker made of the frame before. So the picture is one frame behind the controls (17 ms), and
 * in return the sim and the drawing run side by side on two cores, and a tick that takes long
 * holds up neither the camera, the HUD nor a touch. Only one `advance` is in the air at a time;
 * while the worker is busy the page saves the time up, and hands it over the moment the worker
 * answers.
 */

/** The worker (or, in tests, a stand-in) as the client talks to it. */
export interface SimPort {
  post(msg: ToSim, transfer?: Transferable[]): void;
  onMessage: ((msg: FromSim) => void) | null;
}

/**
 * The longest one `advance` may simulate in the worker before it answers, in ms. Nothing is drawn
 * on that thread, so a whole tick's time is free; past it the match plays a little slow (a local
 * match or host) or catches up over the next frames (a guest), as it does on the page.
 */
export const WORKER_BUDGET_MS = STEP_MS;

/** How long a match nobody shows any more is kept before the worker frees it. */
const RELEASE_MS = 3000;

const NO_WORLD: RemoteView = {
  tick: 0,
  phase: 'shop',
  round: 0,
  turn: 0,
  activePlayer: -1,
  tanks: [],
  grid: { width: 0, height: 0 },
};

export class SimClient {
  /** The worker has answered: matches may be made on it. */
  ready = false;
  /** The worker failed to start or threw. */
  broken = false;
  private readonly matches = new Map<number, RemoteMatch>();
  private nextId = 1;

  constructor(private readonly port: SimPort) {
    port.onMessage = (m) => this.receive(m);
  }

  open(match: RemoteMatch, spec: MatchSpec): number {
    const id = this.nextId++;
    this.matches.set(id, match);
    this.port.post({ t: 'create', id, spec });
    return id;
  }

  close(id: number): void {
    if (this.matches.delete(id)) this.port.post({ t: 'dispose', id });
  }

  post(msg: ToSim, transfer?: Transferable[]): void {
    this.port.post(msg, transfer);
  }

  private receive(m: FromSim): void {
    if (m.t === 'ready') {
      this.ready = true;
      return;
    }
    this.matches.get(m.id)?.receive(m);
  }
}

/** Merge two `net()` lines of the same side: a guest's counts add up, the rest is the newer. */
export function mergeNet(a: string, b: string): string {
  const pa = /^guest starved=(\d+) behind=(\d+) rebuilds=(\d+)$/.exec(a);
  const pb = /^guest starved=(\d+) behind=(\d+) rebuilds=(\d+)$/.exec(b);
  if (!pa || !pb) return b || a;
  return `guest starved=${Number(pa[1]) + Number(pb[1])} behind=${Math.max(Number(pa[2]), Number(pb[2]))} rebuilds=${pb[3]}`;
}

/** A match whose sim runs in the worker. */
export class RemoteMatch implements GameMatch {
  world: RemoteView = NO_WORLD;
  ready = false;
  shed = 0;
  /** The worker could not build the match ('' = fine). */
  error = '';
  protected readonly id: number;
  private readonly mirror = new SnapshotMirror();
  private listeners: ((s: RenderSnapshot) => void)[] = [];
  private waiting: (() => void)[] = [];
  /** Packets not yet shown: they go to the renderer inside a frame, not when they arrive. */
  private inbox: TickPacket[] = [];
  /** Buffers of packets already applied, on their way back to the worker. */
  private spent: ArrayBuffer[] = [];
  private hudState: HudState | null = null;
  private at = 0;
  private inFlight = false;
  /** Wall-clock ms not yet handed to the worker. */
  private owed = 0;
  private simTotal = 0;
  private perf: SimPerf | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly hashWaits = new Map<number, (h: { tick: number; hash: string }) => void>();
  private hashN = 0;

  constructor(
    protected readonly client: SimClient,
    readonly content: ResolvedContent,
    protected readonly kind: MatchSpec['kind'],
    spec: MatchSpec,
  ) {
    this.id = client.open(this, spec);
  }

  whenReady(fn: () => void): () => void {
    if (this.ready) {
      fn();
      return () => {};
    }
    this.waiting.push(fn);
    return () => {
      this.waiting = this.waiting.filter((w) => w !== fn);
    };
  }

  subscribe(fn: (s: RenderSnapshot) => void): () => void {
    this.listeners.push(fn);
    const s = this.mirror.full();
    if (s) fn(s);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  input(player: number, input: Input): void {
    this.client.post({ t: 'input', id: this.id, player, input });
  }

  advance(dtMs: number): number {
    this.drain();
    this.owed = Math.min(this.owed + dtMs, STEP_MS * MAX_STEPS);
    this.pump();
    return this.at;
  }

  /** Show the packets that have arrived, in order. */
  private drain(): void {
    if (this.inbox.length === 0) return;
    const packets = this.inbox;
    this.inbox = [];
    for (const p of packets) {
      const s = this.mirror.apply(p);
      this.spent.push(p.buf);
      for (const l of this.listeners) l(s);
    }
  }

  private pump(): void {
    if (this.inFlight || this.disposed || !this.ready) return;
    const bufs = this.spent;
    this.spent = [];
    this.inFlight = true;
    this.client.post({ t: 'advance', id: this.id, dt: this.owed, bufs }, bufs);
    this.owed = 0;
  }

  limitFrame(ms: number): void {
    this.client.post({
      t: 'limit',
      id: this.id,
      ms: ms === Infinity ? ms : Math.max(ms, WORKER_BUDGET_MS),
    });
  }

  timeParts(on: boolean): void {
    this.perf = null;
    this.client.post({ t: 'timing', id: this.id, on });
  }

  takePerf(): SimPerf {
    const p = this.perf ?? {
      projectiles: 0,
      debris: 0,
      settle: 0,
      react: 0,
      note: '',
      holding: '',
      parts: [],
      worstMs: 0,
      worstTick: '',
      net: this.net(),
    };
    // the gauges stand until the worker's next word; the sums start again
    if (this.perf) this.perf = { ...p, parts: [], worstMs: 0, worstTick: '', net: '' };
    return p;
  }

  net(): string {
    return this.kind === 'local' ? '' : (this.perf?.net ?? '') || this.kind;
  }

  hud(): HudState {
    if (!this.hudState) throw new Error('match not ready');
    return this.hudState;
  }

  simMs(): number {
    return this.simTotal;
  }

  /** The worker's state hash and the tick it is of (tests). */
  hash(): Promise<{ tick: number; hash: string }> {
    return new Promise((ok) => {
      const n = ++this.hashN;
      this.hashWaits.set(n, ok);
      this.client.post({ t: 'hash', id: this.id, n });
    });
  }

  /**
   * A view shows this match (cancels a pending `release`); the function it returns says the view
   * is gone. The worker frees the match a moment later unless another view has taken it up, which
   * is what React's double mount in development does.
   */
  hold(): () => void {
    if (this.releaseTimer !== null) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    return () => {
      this.releaseTimer = setTimeout(() => this.dispose(), RELEASE_MS);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.releaseTimer !== null) clearTimeout(this.releaseTimer);
    this.client.close(this.id);
  }

  receive(m: FromSim): void {
    switch (m.t) {
      case 'tick':
        this.inbox.push(m.packet);
        return;
      case 'state': {
        this.world = m.view;
        this.shed = m.shed;
        if (m.hud) this.hudState = m.hud;
        if (m.perf) {
          const old = this.perf;
          this.perf = old
            ? {
                ...m.perf,
                parts: m.perf.parts.map((v, i) => v + (old.parts[i] ?? 0)),
                worstMs: Math.max(m.perf.worstMs, old.worstMs),
                worstTick: m.perf.worstMs >= old.worstMs ? m.perf.worstTick : old.worstTick,
                net: mergeNet(old.net, m.perf.net),
              }
            : m.perf;
        }
        this.onView(m.view);
        if (m.ack) {
          this.at = m.ack.at;
          this.simTotal += m.ack.ms;
          this.inFlight = false;
          // the worker fell behind the frames: hand it the saved-up time at once
          if (this.owed >= STEP_MS) this.pump();
        }
        if (m.ready && !this.ready) {
          // the first map, so the view has something to mount a renderer on
          this.drain();
          this.at = m.view.tick;
          this.ready = true;
          const fns = this.waiting;
          this.waiting = [];
          for (const fn of fns) fn();
        }
        return;
      }
      case 'failed':
        this.error = m.error;
        console.error(`sim worker: ${m.error}`);
        return;
      case 'hash':
        this.hashWaits.get(m.n)?.({ tick: m.tick, hash: m.hash });
        this.hashWaits.delete(m.n);
        return;
      default:
        this.onMessage(m);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for the online matches below
  protected onView(view: RemoteView): void {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onMessage(m: FromSim): void {}
}

/** A local match (hot-seat, bots) in the worker. */
export class RemoteLocalMatch extends RemoteMatch {
  constructor(client: SimClient, content: ResolvedContent, options: WorldOptions) {
    super(client, content, 'local', { kind: 'local', options });
  }
}

/** The host's match in the worker: what `HostSession` calls goes over as messages. */
export class RemoteHostMatch extends RemoteMatch {
  desyncs = 0;
  onDesync: ((player: number) => void) | null = null;
  /** The live link of each attached guest, by the number the worker knows it as. */
  private readonly links = new Map<number, Link>();
  private readonly linkOf = new Map<number, number>();
  private nextLink = 1;

  constructor(
    client: SimClient,
    content: ResolvedContent,
    readonly start: StartInfo,
    readonly me: number,
  ) {
    super(client, content, 'host', { kind: 'host', start, me });
  }

  submit(player: number, action: Input): void {
    this.client.post({ t: 'submit', id: this.id, player, action });
  }

  attach(player: number, link: Link, haveTick: number): void {
    this.forget(player);
    const n = this.nextLink++;
    this.links.set(n, link);
    this.linkOf.set(player, n);
    this.client.post({ t: 'attach', id: this.id, player, link: n, haveTick });
  }

  detach(player: number): void {
    this.forget(player);
    this.client.post({ t: 'detach', id: this.id, player });
  }

  /** What the worker still sends for a link that is gone is dropped, never given to its successor. */
  private forget(player: number): void {
    const old = this.linkOf.get(player);
    if (old !== undefined) this.links.delete(old);
    this.linkOf.delete(player);
  }

  connected(player: number): boolean {
    return this.linkOf.has(player);
  }

  handle(player: number, msg: PeerMessage): void {
    this.client.post({ t: 'fromGuest', id: this.id, player, msg });
  }

  protected override onView(view: RemoteView): void {
    if (view.desyncs !== undefined) this.desyncs = view.desyncs;
  }

  protected override onMessage(m: FromSim): void {
    if (m.t === 'toGuest') this.links.get(m.link)?.send(m.msg);
    else if (m.t === 'desync') this.onDesync?.(m.player);
  }
}

/** A guest's match in the worker. */
export class RemoteGuestMatch extends RemoteMatch {
  you: number;
  rebuilds = 0;
  lag = 0;

  constructor(
    client: SimClient,
    content: ResolvedContent,
    start: PeerStart,
    public send: (msg: PeerMessage) => void,
  ) {
    super(client, content, 'guest', { kind: 'guest', start });
    this.you = start.you;
  }

  handle(msg: PeerMessage): void {
    this.client.post({ t: 'fromHost', id: this.id, msg });
  }

  /**
   * The link came back. The tick returned is the last the worker reported; it may have simulated
   * a few more since, and drops the inputs the host then sends twice (`SimHost.unseen`).
   */
  resumeFrom(): number {
    this.client.post({ t: 'resume', id: this.id });
    return this.world.tick;
  }

  protected override onView(view: RemoteView): void {
    if (view.you !== undefined) this.you = view.you;
    if (view.rebuilds !== undefined) this.rebuilds = view.rebuilds;
    if (view.lag !== undefined) this.lag = view.lag;
  }

  protected override onMessage(m: FromSim): void {
    if (m.t === 'toHost') this.send(m.msg);
  }
}

let thread: SimClient | null = null;

/**
 * Start the sim worker (once per page; safe to call again). Until it has answered, and wherever a
 * browser can't run it, `simThread` gives null and matches run on the page as before.
 */
export function startSimThread(): void {
  if (thread || typeof Worker === 'undefined') return;
  try {
    const worker = new Worker(new URL('./sim-worker.ts', import.meta.url), { type: 'module' });
    const port: SimPort = {
      post: (msg, transfer) => worker.postMessage(msg, transfer ?? []),
      onMessage: null,
    };
    const client = new SimClient(port);
    worker.onmessage = (e: MessageEvent<FromSim>) => port.onMessage?.(e.data);
    worker.onerror = (e) => {
      console.error(`sim worker: ${e.message}`);
      // it never came up: stay on the page's thread
      if (!client.ready) client.broken = true;
    };
    thread = client;
  } catch (err) {
    console.error('sim worker did not start', err);
  }
}

/** The sim worker, once it is up; null = run the sim on this thread. */
export function simThread(): SimClient | null {
  return thread && thread.ready && !thread.broken ? thread : null;
}

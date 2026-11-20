import type { PeerMessage } from '@mudders/shared';
import type { ResolvedContent } from '@mudders/sim';
import type { Link } from '../net/link';
import { GuestMatch, HostMatch } from '../net/lockstep';
import { LocalMatch, hudKey, type SimMatch } from './match';
import { BufferPool, encodeTick, type FromSim, type RemoteView, type ToSim } from './sim-wire';

interface Entry {
  match: SimMatch;
  /** Change key of the HUD state last sent. */
  hudKey: string;
  timing: boolean;
  /**
   * Guest, after its link came back: inputs stamped before this tick are ones it has already
   * simulated (the page told the host the last tick it knew of, which can be a few behind).
   */
  seenBefore: number;
  off: () => void;
}

/**
 * The worker's side of the sim thread: runs every match the page asks for and answers with tick
 * packets and state. Knows nothing of workers itself (`sim-worker.ts` wires it to one), so tests
 * drive it through a plain function.
 */
export class SimHost {
  private readonly matches = new Map<number, Entry>();
  private readonly pool = new BufferPool();

  constructor(
    private readonly content: ResolvedContent,
    private readonly post: (msg: FromSim, transfer?: Transferable[]) => void,
  ) {}

  /** A match is resolving a shot (background practice in the worker waits). */
  get resolving(): boolean {
    for (const e of this.matches.values()) if (e.match.world.phase === 'resolve') return true;
    return false;
  }

  handle(m: ToSim): void {
    if (m.t === 'create') return this.create(m);
    const e = this.matches.get(m.id);
    if (!e) return;
    const match = e.match;
    switch (m.t) {
      case 'dispose':
        e.off();
        this.matches.delete(m.id);
        return;
      case 'advance': {
        for (const b of m.bufs) this.pool.give(b);
        const t0 = performance.now();
        const at = match.advance(m.dt);
        this.state(m.id, e, { ack: { at, ms: performance.now() - t0 } });
        return;
      }
      case 'input':
        match.input(m.player, m.input);
        break;
      case 'limit':
        match.limitFrame(m.ms);
        return;
      case 'timing':
        e.timing = m.on;
        match.timeParts(m.on);
        return;
      case 'hash':
        this.post({
          t: 'hash',
          id: m.id,
          n: m.n,
          tick: match.world.tick,
          hash: match.world.hash(),
        });
        return;
      case 'attach':
        if (match instanceof HostMatch) {
          match.attach(m.player, this.guestLink(m.id, m.link), m.haveTick);
        }
        break;
      case 'detach':
        if (match instanceof HostMatch) match.detach(m.player);
        return;
      case 'submit':
        if (match instanceof HostMatch) match.submit(m.player, m.action);
        return;
      case 'fromGuest': {
        if (!(match instanceof HostMatch)) return;
        const before = match.desyncs;
        match.handle(m.player, m.msg);
        // inputs and hashes change nothing the page shows until the next tick
        if (match.desyncs === before) return;
        break;
      }
      case 'fromHost':
        if (!(match instanceof GuestMatch)) return;
        match.handle(this.unseen(e, m.msg));
        // a permit with inputs shows at the next advance; a start rebuilt the world
        if (m.msg.type !== 'start') return;
        break;
      case 'resume':
        if (match instanceof GuestMatch) {
          match.resumeFrom();
          e.seenBefore = match.world.tick;
        }
        return;
    }
    this.state(m.id, e);
  }

  private create(m: Extract<ToSim, { t: 'create' }>): void {
    const { id, spec } = m;
    let match: SimMatch;
    try {
      if (spec.kind === 'local') match = new LocalMatch(this.content, spec.options);
      else if (spec.kind === 'host') {
        const host = new HostMatch(this.content, spec.start, spec.me);
        host.onDesync = (player) => this.post({ t: 'desync', id, player });
        match = host;
      } else {
        match = new GuestMatch(this.content, spec.start, (msg) =>
          this.post({ t: 'toHost', id, msg }),
        );
      }
    } catch (err) {
      this.post({ t: 'failed', id, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    // every snapshot goes to the page as it is made; the first is the whole map
    const off = match.subscribe((s) => {
      const packet = encodeTick(s, this.pool);
      this.post({ t: 'tick', id, packet }, [packet.buf]);
    });
    const e: Entry = { match, hudKey: '', timing: false, seenBefore: 0, off };
    this.matches.set(id, e);
    this.state(id, e, { ready: true });
  }

  /** The host's end of a guest's link: what the match sends goes to the page, which has the wire. */
  private guestLink(id: number, link: number): Link {
    return {
      path: 'local',
      open: true,
      send: (msg) => this.post({ t: 'toGuest', id, link, msg }),
      close: () => {},
      onMessage: null,
      onClose: null,
    };
  }

  /** A host message without the inputs this guest simulated before its link dropped. */
  private unseen(e: Entry, msg: PeerMessage): PeerMessage {
    if (msg.type === 'start') {
      e.seenBefore = 0;
      return msg;
    }
    if (msg.type !== 'tick' || e.seenBefore <= 0) return msg;
    const before = e.seenBefore;
    if (!msg.inputs.some((i) => i.t < before)) return msg;
    return { ...msg, inputs: msg.inputs.filter((i) => i.t >= before) };
  }

  private state(
    id: number,
    e: Entry,
    extra: Pick<Extract<FromSim, { t: 'state' }>, 'ack' | 'ready'> = {},
  ): void {
    const match = e.match;
    const w = match.world;
    const view: RemoteView = {
      tick: w.tick,
      phase: w.phase,
      round: w.round,
      turn: w.turn,
      activePlayer: w.activePlayer,
      tanks: w.tanks.map((t) => ({
        x: t.x,
        y: t.y,
        w: t.w,
        alive: t.alive,
        health: t.health,
        maxHealth: t.maxHealth,
        team: t.team,
        bot: t.bot,
      })),
      grid: { width: w.grid.width, height: w.grid.height },
      ...(match instanceof GuestMatch
        ? { you: match.you, lag: match.lag, rebuilds: match.rebuilds }
        : {}),
      ...(match instanceof HostMatch ? { desyncs: match.desyncs } : {}),
    };
    const hud = match.hud();
    const key = hudKey(hud);
    const changed = key !== e.hudKey;
    e.hudKey = key;
    this.post({
      t: 'state',
      id,
      view,
      shed: match.shed,
      ...(changed ? { hud } : {}),
      ...(e.timing && extra.ack ? { perf: match.takePerf() } : {}),
      ...extra,
    });
  }
}

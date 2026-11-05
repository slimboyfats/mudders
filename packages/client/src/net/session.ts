import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  type LinkPath,
  type LobbySeat,
  type NetSetup,
  type PeerLobby,
  type PeerMessage,
  type PeerStart,
} from '@mudders/shared';
import { KERNEL_VERSION, type ResolvedContent } from '@mudders/sim';
import type { Link } from './link';
import { GuestMatch, HostMatch } from './lockstep';

/** How often each side pings, and how long silence lasts before a link is declared dead. */
export const PING_MS = 1000;
export const SILENCE_MS = 6000;

/** §6.1: a dropped human gets this long to come back before an AI plays for them. */
export const TAKEOVER_MS = 20_000;
/** The personality that stands in for a dropped human. */
export const STAND_IN = 'ai.shooter';

/** Lobby rules without the slots: the host's seats decide those. */
export type LobbyRules = Omit<NetSetup, 'slots'>;

export interface HostSeat {
  kind: 'host' | 'guest' | 'bot' | 'open';
  name: string;
  /** `ai.*` for bots. */
  bot?: string;
  /** Guest seats: the token that lets the same guest reclaim it. */
  token?: string;
  link?: Link | null;
  path?: LinkPath;
  rtt?: number;
  lastHeard?: number;
  /** When this human went away (link lost, or the host's own tab hidden), or undefined. */
  awaySince?: number;
  /** `ai.*` id playing for this human while they are away (§6.1 takeover). */
  standIn?: string;
}

/** Things the session needs from its environment; tests pass fakes. */
export interface SessionEnv {
  now: () => number;
  token: () => string;
}

const browserEnv: SessionEnv = {
  now: () => performance.now(),
  // not randomUUID: that only exists in secure contexts, and a phone on http://192.168.x.x isn't one
  token: () =>
    Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join(''),
};

/** Why a guest is refused at the door (§2c.4: protocol and content must match exactly). */
export function checkJoin(
  msg: Extract<PeerMessage, { type: 'join' }>,
  content: ResolvedContent,
): string | null {
  if (msg.protocolVersion !== PROTOCOL_VERSION) {
    return `version mismatch: host speaks protocol v${PROTOCOL_VERSION}, you v${msg.protocolVersion}; reload to update`;
  }
  if (msg.kernelVersion !== KERNEL_VERSION || msg.contentHash !== content.hash) {
    return 'different game content than the host (one of you has an older build); reload to update';
  }
  return null;
}

/**
 * The host's lobby and match (§6.2 star): seats, settings, the join handshake with the version
 * and content-hash check, pings, and the `HostMatch` once started.
 */
export class HostSession {
  seats: HostSeat[];
  rules: LobbyRules;
  match: HostMatch | null = null;
  /** How long a dropped human (or a host whose tab is hidden) has before an AI plays; 0 = never. */
  takeoverMs = TAKEOVER_MS;
  /** seat index → player index, fixed at start. */
  private playerOf: number[] = [];
  private readonly pending = new Set<Link>();
  private readonly subs = new Set<() => void>();
  private pingN = 0;
  private readonly sentAt = new Map<number, number>();

  constructor(
    readonly content: ResolvedContent,
    name: string,
    rules: LobbyRules,
    private readonly env: SessionEnv = browserEnv,
  ) {
    this.rules = rules;
    this.seats = Array.from({ length: MAX_PLAYERS }, (_, i) =>
      i === 0 ? { kind: 'host' as const, name } : { kind: 'open' as const, name: '' },
    );
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private changed(): void {
    for (const fn of this.subs) fn();
    this.broadcastLobby();
  }

  /** The NetSetup the seats and rules describe. */
  get setup(): NetSetup {
    return {
      ...this.rules,
      slots: this.seats.map((s) =>
        s.kind === 'open' ? 'off' : s.kind === 'bot' ? (s.bot ?? 'ai.shooter') : 'human',
      ),
    };
  }

  get playerCount(): number {
    return this.seats.filter((s) => s.kind !== 'open').length;
  }

  rename(name: string): void {
    const host = this.seats[0];
    if (!host || !name.trim()) return;
    host.name = name.trim().slice(0, 16);
    this.changed();
  }

  setRules(rules: LobbyRules): void {
    if (this.match) return;
    this.rules = rules;
    this.changed();
  }

  /** Host: put an AI in an open seat, change its personality, or open it again. */
  setSeat(i: number, value: 'open' | string): void {
    const s = this.seats[i];
    if (this.match || !s || s.kind === 'host' || s.kind === 'guest') return;
    this.seats[i] =
      value === 'open' ? { kind: 'open', name: '' } : { kind: 'bot', name: '', bot: value };
    this.changed();
  }

  /** A new link to a guest: wait for its `join`. */
  addLink(link: Link): void {
    this.pending.add(link);
    let seat = -1;
    link.onMessage = (msg) => {
      if (seat >= 0) {
        this.seats[seat]!.lastHeard = this.env.now();
        return this.fromGuest(seat, msg);
      }
      if (msg.type !== 'join') return;
      seat = this.admit(link, msg);
      this.pending.delete(link);
    };
    link.onClose = () => {
      this.pending.delete(link);
      if (seat < 0) return;
      const s = this.seats[seat]!;
      if (s.link !== link) return; // replaced by a newer link
      s.link = null;
      s.awaySince = this.env.now();
      const p = this.playerOf[seat];
      if (this.match && p !== undefined) this.match.detach(p);
      this.changed();
    };
  }

  private admit(link: Link, msg: Extract<PeerMessage, { type: 'join' }>): number {
    const refuse = (reason: string) => {
      link.send({ type: 'accept', ok: false, reason });
      link.close();
      return -1;
    };
    const bad = checkJoin(msg, this.content);
    if (bad) return refuse(bad);
    let seat = msg.token
      ? this.seats.findIndex((s) => s.kind === 'guest' && s.token === msg.token)
      : -1;
    if (seat >= 0) {
      const old = this.seats[seat]!.link;
      if (old && old !== link) {
        old.onClose = null;
        old.close();
      }
    } else {
      if (this.match) return refuse('that match has already started');
      seat = this.seats.findIndex((s) => s.kind === 'open');
      if (seat < 0) return refuse('the game is full');
      this.seats[seat] = { kind: 'guest', name: msg.name, token: this.env.token() };
    }
    const s = this.seats[seat]!;
    s.link = link;
    s.path = link.path;
    s.lastHeard = this.env.now();
    link.send({ type: 'accept', ok: true, ...(s.token ? { token: s.token } : {}) });
    const p = this.playerOf[seat];
    if (this.match && p !== undefined) {
      this.match.attach(p, link, msg.haveTick);
      this.standDown(seat);
    }
    delete s.awaySince;
    this.changed();
    return seat;
  }

  private fromGuest(seat: number, msg: PeerMessage): void {
    const s = this.seats[seat]!;
    if (msg.type === 'ping') {
      s.link?.send({ type: 'pong', n: msg.n });
      return;
    }
    if (msg.type === 'pong') {
      const at = this.sentAt.get(msg.n);
      if (at !== undefined) s.rtt = Math.round(this.env.now() - at);
      return;
    }
    if (msg.type === 'bye') {
      s.link?.close();
      return;
    }
    const p = this.playerOf[seat];
    if (this.match && p !== undefined) this.match.handle(p, msg);
  }

  /** Host setting: how long a dropped human has before an AI stands in (0 = never). */
  setTakeover(ms: number): void {
    this.takeoverMs = Math.max(0, ms);
    this.changed();
  }

  /** The host's own tab was hidden or shown: a long-hidden host gets an AI stand-in too. */
  setHostAway(away: boolean): void {
    const s = this.seats[0];
    if (!s) return;
    if (away) {
      s.awaySince ??= this.env.now();
      return;
    }
    delete s.awaySince;
    if (this.match) this.standDown(0);
    this.changed();
  }

  /** Seat a stand-in AI for a human who has been away longer than `takeoverMs` (§6.1). */
  private standUp(seat: number, now: number): boolean {
    const s = this.seats[seat]!;
    const p = this.playerOf[seat];
    if (!this.match || p === undefined || p < 0 || s.standIn || s.awaySince === undefined) {
      return false;
    }
    if (this.takeoverMs <= 0 || now - s.awaySince < this.takeoverMs) return false;
    s.standIn = STAND_IN;
    this.match.submit(p, { type: 'takeover', bot: STAND_IN });
    return true;
  }

  /** The human is back: hand the tank back. */
  private standDown(seat: number): void {
    const s = this.seats[seat]!;
    const p = this.playerOf[seat];
    if (!s.standIn || !this.match || p === undefined) return;
    delete s.standIn;
    this.match.submit(p, { type: 'takeover', bot: null });
  }

  /** Call every `PING_MS`: pings every guest, drops links that went silent, seats stand-ins. */
  heartbeat(): void {
    const now = this.env.now();
    let changed = false;
    this.seats.forEach((s, i) => {
      if ((s.kind === 'guest' || s.kind === 'host') && this.standUp(i, now)) changed = true;
    });
    if (changed) this.broadcastLobby();
    const n = ++this.pingN;
    this.sentAt.set(n, now);
    this.sentAt.delete(n - 30);
    for (const s of this.seats) {
      if (!s.link) continue;
      if (now - (s.lastHeard ?? now) > SILENCE_MS) {
        s.link.close();
        continue;
      }
      s.link.send({ type: 'ping', n });
    }
    for (const fn of this.subs) fn();
  }

  lobbyFor(seat: number): PeerLobby {
    return {
      type: 'lobby',
      you: seat,
      setup: this.setup,
      seats: this.seats.map((s): LobbySeat => ({
        name: s.name,
        kind: s.kind,
        connected: s.kind === 'host' || s.kind === 'bot' || !!s.link?.open,
        ...(s.bot ? { bot: s.bot } : {}),
        ...(s.kind === 'host' ? { path: 'local' as const } : s.path ? { path: s.path } : {}),
        ...(s.standIn ? { standIn: s.standIn } : {}),
        ...(s.rtt !== undefined ? { rtt: s.rtt } : {}),
      })),
    };
  }

  private broadcastLobby(): void {
    this.seats.forEach((s, i) => s.link?.send(this.lobbyFor(i)));
  }

  /** Start the match: every peer builds the same world from this seed and setup. */
  start(seed: number, mode = 'mode.classic'): HostMatch {
    if (this.match) return this.match;
    const setup = this.setup;
    let p = 0;
    this.playerOf = this.seats.map((s) => (s.kind === 'open' ? -1 : p++));
    this.match = new HostMatch(this.content, { seed, setup, mode }, this.playerOf[0]!);
    this.seats.forEach((s, i) => {
      if (s.kind === 'guest' && s.link?.open) this.match!.attach(this.playerOf[i]!, s.link, -1);
    });
    this.changed();
    return this.match;
  }

  /** Player index → seat (for names in the HUD). */
  seatOfPlayer(player: number): HostSeat | undefined {
    const i = this.playerOf.indexOf(player);
    return i >= 0 ? this.seats[i] : undefined;
  }

  close(): void {
    for (const s of this.seats) {
      s.link?.send({ type: 'bye', reason: 'the host closed the game' });
      s.link?.close();
    }
    for (const l of this.pending) l.close();
  }
}

export type GuestStatus =
  'connecting' | 'lobby' | 'playing' | 'reconnecting' | 'refused' | 'closed';

/**
 * A guest's view: the join handshake, lobby state, and the `GuestMatch` once the host starts.
 * Survives link replacement (§6.1 mobile reconnect): `attach` a fresh link and it resumes.
 */
export class GuestSession {
  status: GuestStatus = 'connecting';
  reason = '';
  lobby: PeerLobby | null = null;
  match: GuestMatch | null = null;
  link: Link | null = null;
  rtt = -1;
  /** Fires when the current link dies (the transport should reconnect and `attach` again). */
  onLost: (() => void) | null = null;
  private readonly subs = new Set<() => void>();
  private lastHeard = 0;
  private pingN = 0;
  private readonly sentAt = new Map<number, number>();

  constructor(
    readonly content: ResolvedContent,
    readonly name: string,
    /** Seat token from an earlier session (reload during a match). */
    public token: string | undefined,
    private readonly env: SessionEnv = browserEnv,
  ) {}

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private changed(): void {
    for (const fn of this.subs) fn();
  }

  attach(link: Link): void {
    this.link = link;
    this.lastHeard = this.env.now();
    link.onMessage = (msg) => this.receive(msg);
    link.onClose = () => {
      if (this.link !== link) return;
      this.link = null;
      if (this.status === 'refused' || this.status === 'closed') return;
      this.status = 'reconnecting';
      this.changed();
      this.onLost?.();
    };
    if (this.match) this.match.send = (m) => link.send(m);
    link.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      kernelVersion: KERNEL_VERSION,
      contentHash: this.content.hash,
      name: this.name,
      ...(this.token ? { token: this.token } : {}),
      haveTick: this.match ? this.match.resumeFrom() : -1,
    });
  }

  private receive(msg: PeerMessage): void {
    this.lastHeard = this.env.now();
    const link = this.link;
    switch (msg.type) {
      case 'accept':
        if (!msg.ok) {
          this.status = 'refused';
          this.reason = msg.reason ?? 'refused';
        } else {
          if (msg.token) this.token = msg.token;
          this.status = this.match ? 'playing' : 'lobby';
        }
        return this.changed();
      case 'lobby':
        this.lobby = msg;
        return this.changed();
      case 'start':
        this.onStart(msg);
        return this.changed();
      case 'tick':
        this.match?.handle(msg);
        return;
      case 'ping':
        link?.send({ type: 'pong', n: msg.n });
        return;
      case 'pong': {
        const at = this.sentAt.get(msg.n);
        if (at !== undefined) this.rtt = Math.round(this.env.now() - at);
        return;
      }
      case 'bye':
        this.status = 'closed';
        this.reason = msg.reason;
        this.link = null;
        link?.close();
        return this.changed();
      default:
        return;
    }
  }

  private onStart(msg: PeerStart): void {
    if (this.match) this.match.handle(msg);
    else {
      const link = this.link;
      this.match = new GuestMatch(this.content, msg, (m) => link?.send(m));
      if (link) this.match.send = (m) => link.send(m);
    }
    this.status = 'playing';
  }

  /** Call every `PING_MS`: pings the host; a silent host means the link is dead. */
  heartbeat(): void {
    const link = this.link;
    if (!link) return;
    const now = this.env.now();
    if (now - this.lastHeard > SILENCE_MS) {
      link.close();
      return;
    }
    const n = ++this.pingN;
    this.sentAt.set(n, now);
    this.sentAt.delete(n - 30);
    link.send({ type: 'ping', n });
  }

  leave(): void {
    this.status = 'closed';
    const link = this.link;
    this.link = null;
    link?.send({ type: 'bye', reason: 'left' });
    link?.close();
  }
}

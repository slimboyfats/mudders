import {
  ClientMessageSchema,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  type ClientMessage,
  type LinkPath,
  type RoomInfo,
  type ServerError,
  type ServerMessage,
} from '@mudders/shared';

/**
 * In-memory lobby (§6.5): identities, rooms with 6-character codes, the offer/answer/ice relay and
 * the WebSocket data relay (§6.4). Transport-agnostic: the server glue feeds it raw socket text
 * and hands it a `send` per connection, so the whole thing is unit-testable without sockets.
 */
export interface LobbyOptions {
  /** A dropped member keeps its seat (and the host its room) this long (§6.1: ~20 s). */
  graceMs: number;
  /** A room nobody touched for this long is closed. */
  idleMs: number;
  /** Room creations per address per minute. */
  createsPerMinute: number;
  /** Messages per connection per second (relay traffic is ~20/s per guest). */
  messagesPerSecond: number;
  now: () => number;
  random: () => number;
}

export const DEFAULT_LOBBY_OPTIONS: LobbyOptions = {
  graceMs: 30_000,
  idleMs: 2 * 60 * 60_000,
  createsPerMinute: 6,
  messagesPerSecond: 200,
  now: () => Date.now(),
  random: () => Math.random(),
};

interface Conn {
  send: (msg: ServerMessage) => void;
  close: () => void;
  addr: string;
  peer: Peer | null;
  /** Rate limiting: window start and count. */
  winStart: number;
  winCount: number;
}

interface Peer {
  id: string;
  secret: string;
  conn: Conn | null;
  room: Room | null;
  /** When the socket dropped (for the grace period), or 0 while connected. */
  droppedAt: number;
}

interface Room {
  code: string;
  name: string;
  host: Peer;
  public: boolean;
  maxPlayers: number;
  summary: string;
  region: string;
  started: boolean;
  members: Peer[];
  touched: number;
}

export interface PathStats {
  p2p: number;
  relay: number;
  local: number;
  /** Mean ms to open, per path. */
  meanMs: Record<LinkPath, number>;
  /** Share of online links that needed the relay, 0..1 (§6.4: the TURN decision input). */
  relayShare: number;
}

/** Relay load (§6.4): what TURN would take off this server. */
export interface RelayStats {
  frames: number;
  bytes: number;
  /** Bytes relayed in the last full minute, and the busiest minute since start. */
  bytesLastMinute: number;
  peakBytesPerMinute: number;
}

/** Most rooms one `listRooms` reply carries. */
export const LIST_MAX = 50;

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export class Lobby {
  private readonly opts: LobbyOptions;
  private readonly peers = new Map<string, Peer>();
  private readonly rooms = new Map<string, Room>();
  private readonly creates = new Map<string, number[]>();
  private readonly pathCount: Record<LinkPath, number> = { p2p: 0, relay: 0, local: 0 };
  private readonly pathMs: Record<LinkPath, number> = { p2p: 0, relay: 0, local: 0 };
  private readonly relay = {
    frames: 0,
    bytes: 0,
    minuteStart: 0,
    minuteBytes: 0,
    last: 0,
    peak: 0,
  };

  constructor(opts: Partial<LobbyOptions> = {}) {
    this.opts = { ...DEFAULT_LOBBY_OPTIONS, ...opts };
  }

  /** A new socket. The returned handle receives its messages and its close. */
  connect(send: (msg: ServerMessage) => void, close: () => void, addr = '?') {
    const conn: Conn = { send, close, addr, peer: null, winStart: 0, winCount: 0 };
    return {
      message: (text: string) => this.onText(conn, text),
      close: () => this.onClose(conn),
    };
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  stats(): PathStats {
    const mean = (p: LinkPath) =>
      this.pathCount[p] ? Math.round(this.pathMs[p] / this.pathCount[p]) : 0;
    const online = this.pathCount.p2p + this.pathCount.relay;
    return {
      ...this.pathCount,
      meanMs: { p2p: mean('p2p'), relay: mean('relay'), local: mean('local') },
      relayShare: online ? Math.round((this.pathCount.relay / online) * 1000) / 1000 : 0,
    };
  }

  relayStats(): RelayStats {
    this.rollRelayMinute(this.opts.now());
    const r = this.relay;
    return {
      frames: r.frames,
      bytes: r.bytes,
      bytesLastMinute: r.last,
      peakBytesPerMinute: Math.max(r.peak, r.minuteBytes),
    };
  }

  private rollRelayMinute(now: number): void {
    const r = this.relay;
    if (now - r.minuteStart < 60_000) return;
    // a gap of more than a minute means the last full minute was quiet
    r.last = now - r.minuteStart < 120_000 ? r.minuteBytes : 0;
    r.peak = Math.max(r.peak, r.minuteBytes);
    r.minuteBytes = 0;
    r.minuteStart = now;
  }

  /**
   * Rooms anyone can join (§6.1 public games): public, waiting, not full, host online. Oldest
   * first (Map insertion order), so the list doesn't reshuffle under a player's finger.
   */
  publicRooms(): RoomInfo[] {
    const rooms: RoomInfo[] = [];
    for (const r of this.rooms.values()) {
      if (!r.public || r.started || r.members.length >= r.maxPlayers || !r.host.conn) continue;
      rooms.push({
        code: r.code,
        name: r.name,
        players: r.members.length,
        maxPlayers: r.maxPlayers,
        summary: r.summary,
        region: r.region,
      });
      if (rooms.length >= LIST_MAX) break;
    }
    return rooms;
  }

  /** Drop expired seats and idle rooms. The server calls this every few seconds. */
  sweep(): void {
    const now = this.opts.now();
    for (const p of [...this.peers.values()]) {
      if (!p.conn && now - p.droppedAt >= this.opts.graceMs) this.forget(p);
    }
    for (const r of [...this.rooms.values()]) {
      if (now - r.touched >= this.opts.idleMs) this.closeRoom(r, 'room expired');
    }
  }

  private onText(conn: Conn, text: string): void {
    const now = this.opts.now();
    if (now - conn.winStart >= 1000) {
      conn.winStart = now;
      conn.winCount = 0;
    }
    if (++conn.winCount > this.opts.messagesPerSecond) {
      if (conn.winCount === this.opts.messagesPerSecond + 1) {
        this.err(conn, 'rateLimited', 'too many messages');
      }
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return this.refuse(conn, 'bad json');
    }
    const parsed = ClientMessageSchema.safeParse(raw);
    if (!parsed.success) return this.refuse(conn, 'bad message');
    const msg = parsed.data;
    if (msg.type === 'hello') return this.hello(conn, msg);
    const peer = conn.peer;
    if (!peer) return this.refuse(conn, 'say hello first');
    if (peer.room) peer.room.touched = now;
    this.handle(conn, peer, msg);
  }

  private refuse(conn: Conn, reason: string): void {
    if (conn.peer) return this.err(conn, 'bad', reason);
    conn.send({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, ok: false, reason });
  }

  private err(conn: Conn, code: ServerError['code'], reason: string): void {
    conn.send({ type: 'error', code, reason });
  }

  private hello(conn: Conn, msg: Extract<ClientMessage, { type: 'hello' }>): void {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      conn.send({
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        ok: false,
        reason: 'update your game',
      });
      return;
    }
    if (conn.peer) return this.err(conn, 'bad', 'already said hello');
    const old = msg.id ? this.peers.get(msg.id) : undefined;
    if (old && old.secret === msg.secret) {
      // reclaim: the old socket (if still half-open) is replaced
      if (old.conn && old.conn !== conn) {
        old.conn.peer = null;
        old.conn.close();
      }
      old.conn = conn;
      old.droppedAt = 0;
      conn.peer = old;
      conn.send({
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        ok: true,
        id: old.id,
        secret: old.secret,
        resumed: true,
      });
      if (old.room) this.broadcast(old.room);
      return;
    }
    const peer: Peer = {
      id: this.uniqueId(),
      secret: this.token(24),
      conn,
      room: null,
      droppedAt: 0,
    };
    this.peers.set(peer.id, peer);
    conn.peer = peer;
    conn.send({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      ok: true,
      id: peer.id,
      secret: peer.secret,
      resumed: false,
    });
  }

  private handle(conn: Conn, peer: Peer, msg: ClientMessage): void {
    switch (msg.type) {
      case 'hello':
        return;
      case 'createRoom': {
        if (!this.allowCreate(conn.addr)) {
          return this.err(conn, 'rateLimited', 'too many rooms, try again in a minute');
        }
        if (peer.room) this.leave(peer);
        const room: Room = {
          code: this.uniqueCode(),
          name: msg.name,
          host: peer,
          public: msg.public,
          maxPlayers: msg.maxPlayers,
          summary: msg.summary,
          region: msg.region,
          started: false,
          members: [peer],
          touched: this.opts.now(),
        };
        this.rooms.set(room.code, room);
        peer.room = room;
        return this.broadcast(room);
      }
      case 'joinRoom': {
        const room = this.rooms.get(msg.code);
        if (!room) return this.err(conn, 'notFound', 'no room with that code');
        if (peer.room === room) return this.broadcast(room);
        // a player coming back to their seat may have been away past the grace window; the host
        // checks their seat token and turns away anyone else
        if (room.started && !msg.rejoin) {
          return this.err(conn, 'started', 'that match has already started');
        }
        if (room.members.length >= room.maxPlayers) return this.err(conn, 'full', 'room is full');
        if (peer.room) this.leave(peer);
        room.members.push(peer);
        peer.room = room;
        room.touched = this.opts.now();
        return this.broadcast(room);
      }
      case 'leaveRoom':
        if (peer.room) this.leave(peer);
        return;
      case 'roomSettings': {
        const room = peer.room;
        if (!room) return this.err(conn, 'notInRoom', 'not in a room');
        if (room.host !== peer) return this.err(conn, 'notHost', 'only the host can change that');
        room.name = msg.name;
        room.public = msg.public;
        room.summary = msg.summary;
        // never below the humans already in the room
        room.maxPlayers = Math.max(msg.maxPlayers, room.members.length);
        return this.broadcast(room);
      }
      case 'listRooms':
        return conn.send({ type: 'rooms', rooms: this.publicRooms() });
      case 'startMatch': {
        const room = peer.room;
        if (!room) return this.err(conn, 'notInRoom', 'not in a room');
        if (room.host !== peer) return this.err(conn, 'notHost', 'only the host can start');
        room.started = true;
        return this.broadcast(room);
      }
      case 'offer':
      case 'answer':
      case 'ice':
      case 'relay': {
        const room = peer.room;
        const to = this.peers.get(msg.to);
        if (!room || !to || to.room !== room) {
          return this.err(conn, 'notInRoom', 'that player is not in your room');
        }
        if (!to.conn) return; // dropped: the sender's link layer retries after reconnect
        if (msg.type === 'relay') {
          this.countRelay(msg.data.length);
          to.conn.send({ type: 'relay', from: peer.id, data: msg.data });
        } else if (msg.type === 'ice') {
          to.conn.send({ type: 'ice', from: peer.id, candidate: msg.candidate });
        } else to.conn.send({ type: msg.type, from: peer.id, sdp: msg.sdp });
        return;
      }
      case 'path': {
        this.pathCount[msg.path]++;
        this.pathMs[msg.path] += msg.ms;
        console.log(`link path=${msg.path} ms=${msg.ms} room=${peer.room?.code ?? '-'}`);
        return;
      }
    }
  }

  private countRelay(bytes: number): void {
    const now = this.opts.now();
    this.rollRelayMinute(now);
    this.relay.frames++;
    this.relay.bytes += bytes;
    this.relay.minuteBytes += bytes;
  }

  private onClose(conn: Conn): void {
    const peer = conn.peer;
    conn.peer = null;
    if (!peer || peer.conn !== conn) return;
    peer.conn = null;
    peer.droppedAt = this.opts.now();
    if (peer.room) this.broadcast(peer.room);
    else this.peers.delete(peer.id);
  }

  private forget(peer: Peer): void {
    if (peer.room) this.leave(peer);
    this.peers.delete(peer.id);
  }

  private leave(peer: Peer): void {
    const room = peer.room;
    if (!room) return;
    peer.room = null;
    room.members = room.members.filter((m) => m !== peer);
    if (room.host === peer) return this.closeRoom(room, 'the host left');
    this.broadcast(room);
  }

  private closeRoom(room: Room, reason: string): void {
    this.rooms.delete(room.code);
    for (const m of room.members) {
      m.room = null;
      m.conn?.send({ type: 'error', code: 'notFound', reason });
    }
    room.members = [];
  }

  private broadcast(room: Room): void {
    const msg: ServerMessage = {
      type: 'roomUpdate',
      code: room.code,
      name: room.name,
      host: room.host.id,
      public: room.public,
      maxPlayers: room.maxPlayers,
      started: room.started,
      members: room.members.map((m) => ({ id: m.id, connected: m.conn !== null })),
    };
    for (const m of room.members) m.conn?.send(msg);
  }

  private allowCreate(addr: string): boolean {
    const now = this.opts.now();
    const recent = (this.creates.get(addr) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= this.opts.createsPerMinute) {
      this.creates.set(addr, recent);
      return false;
    }
    recent.push(now);
    this.creates.set(addr, recent);
    return true;
  }

  private token(n: number, alphabet = ID_ALPHABET): string {
    let s = '';
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(this.opts.random() * alphabet.length)];
    return s;
  }

  private uniqueId(): string {
    for (;;) {
      const id = this.token(10);
      if (!this.peers.has(id)) return id;
    }
  }

  private uniqueCode(): string {
    for (;;) {
      const code = this.token(6, ROOM_CODE_ALPHABET);
      if (!this.rooms.has(code)) return code;
    }
  }
}

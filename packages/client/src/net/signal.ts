import {
  ClientMessageSchema,
  PROTOCOL_VERSION,
  ServerMessageSchema,
  type ClientMessage,
  type RoomUpdate,
  type ServerError,
  type ServerMessage,
} from '@mudders/shared';

export type SignalStatus = 'connecting' | 'waking' | 'open' | 'offline' | 'outdated';

/** After this long without a socket we tell the player the free-tier server is cold-starting (§7). */
const WAKING_AFTER_MS = 2500;
/** Give up (offer the copy-paste mode instead) after this long. */
const GIVE_UP_MS = 90_000;
const STORE = 'mudders.signal.v1';

type Handler<T extends ServerMessage['type']> = (msg: Extract<ServerMessage, { type: T }>) => void;

/**
 * The lobby server socket (§6.5): says hello, keeps one identity across reconnects (id + secret in
 * sessionStorage, so a reload or a cell handover reclaims the same seat), retries while a free-tier
 * host wakes up, and dispatches typed messages. Kept open during a match for reconnects and relay.
 */
export class SignalClient {
  status: SignalStatus = 'connecting';
  id = '';
  room: RoomUpdate | null = null;
  lastError: ServerError | null = null;
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, Set<(m: ServerMessage) => void>>();
  private readonly statusSubs = new Set<() => void>();
  private queue: ClientMessage[] = [];
  private startedAt = 0;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private onWelcome: (() => void)[] = [];

  constructor(readonly baseUrl: string) {
    this.on('roomUpdate', (m) => {
      this.room = m;
    });
    this.on('error', (m) => {
      this.lastError = m;
      if (m.code === 'notFound' && this.room) this.room = null;
    });
  }

  /** Open (or re-open) the socket. Resolves once the server welcomed us. */
  connect(): Promise<void> {
    this.closed = false;
    if (!this.startedAt) this.startedAt = performance.now();
    const ready = new Promise<void>((resolve) => this.onWelcome.push(resolve));
    if (!this.ws) this.open();
    return ready;
  }

  private open(): void {
    const url = `${this.baseUrl.replace(/^http/, 'ws')}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    const wakeTimer = setTimeout(() => {
      if (this.status === 'connecting') this.setStatus('waking');
    }, WAKING_AFTER_MS);
    // a cold free-tier service wakes on plain HTTP sooner than on an upgrade request
    if (this.retry === 1) fetch(`${this.baseUrl}/health`).catch(() => {});
    ws.onopen = () => {
      const saved = this.loadIdentity();
      ws.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: PROTOCOL_VERSION,
          ...(saved ? { id: saved.id, secret: saved.secret } : {}),
        } satisfies ClientMessage),
      );
    };
    ws.onmessage = (e) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const parsed = ServerMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.type === 'welcome') {
        clearTimeout(wakeTimer);
        if (!msg.ok) {
          this.setStatus(msg.reason === 'update your game' ? 'outdated' : 'offline');
          this.closed = true;
          ws.close();
          return;
        }
        this.id = msg.id ?? '';
        if (msg.id && msg.secret) this.saveIdentity(msg.id, msg.secret);
        if (!msg.resumed) this.room = null;
        this.retry = 0;
        this.startedAt = 0;
        this.setStatus('open');
        for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
        for (const r of this.onWelcome.splice(0)) r();
      }
      for (const h of this.handlers.get(msg.type) ?? []) h(msg);
    };
    ws.onclose = () => {
      clearTimeout(wakeTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closed) return;
      if (this.status === 'open') {
        this.startedAt = performance.now();
        this.setStatus('connecting');
      }
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.closed) return;
    if (performance.now() - this.startedAt > GIVE_UP_MS) {
      this.setStatus('offline');
      return;
    }
    if (this.status === 'connecting' && this.retry > 0) this.setStatus('waking');
    const delay = Math.min(5000, 300 * 2 ** this.retry++);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }

  send(msg: ClientMessage): void {
    if (import.meta.env.DEV) ClientMessageSchema.parse(msg);
    if (this.ws && this.status === 'open') this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  on<T extends ServerMessage['type']>(type: T, fn: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    const h = fn as (m: ServerMessage) => void;
    set.add(h);
    return () => set.delete(h);
  }

  /** Wait for the next message of a type (e.g. the roomUpdate after createRoom), or an error. */
  next<T extends ServerMessage['type']>(type: T): Promise<Extract<ServerMessage, { type: T }>> {
    return new Promise((resolve, reject) => {
      const offOk = this.on(type, (m) => {
        offOk();
        offErr();
        resolve(m);
      });
      const offErr = this.on('error', (m) => {
        offOk();
        offErr();
        reject(new Error(m.reason));
      });
    });
  }

  subscribe(fn: () => void): () => void {
    this.statusSubs.add(fn);
    return () => this.statusSubs.delete(fn);
  }

  private setStatus(s: SignalStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const fn of this.statusSubs) fn();
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.room && this.ws && this.status === 'open') {
      this.ws.send(JSON.stringify({ type: 'leaveRoom' } satisfies ClientMessage));
    }
    this.ws?.close();
    this.ws = null;
    this.clearIdentity();
  }

  private loadIdentity(): { id: string; secret: string } | null {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (!raw) return null;
      const v = JSON.parse(raw) as { id?: unknown; secret?: unknown };
      return typeof v.id === 'string' && typeof v.secret === 'string'
        ? { id: v.id, secret: v.secret }
        : null;
    } catch {
      return null;
    }
  }

  private saveIdentity(id: string, secret: string): void {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ id, secret }));
    } catch {
      // private mode: reconnect gets a fresh identity
    }
  }

  private clearIdentity(): void {
    try {
      sessionStorage.removeItem(STORE);
    } catch {
      // ignore
    }
  }
}

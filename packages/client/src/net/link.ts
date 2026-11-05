import { PeerMessageSchema, type LinkPath, type PeerMessage } from '@mudders/shared';

/**
 * One host ⇄ guest connection (§6.2). The game layer only sees this interface, whether the bytes
 * go over an `RTCDataChannel`, the signalling server's WebSocket relay (§6.4: "transparent to the
 * game layer") or an in-memory pair in tests.
 */
export interface Link {
  readonly path: LinkPath;
  readonly open: boolean;
  send(msg: PeerMessage): void;
  close(): void;
  onMessage: ((msg: PeerMessage) => void) | null;
  onClose: (() => void) | null;
}

/** Largest single frame. Data channels allow ~256 KB in Chromium but less elsewhere; relay 32 KB. */
export const CHUNK = 15_000;
const PART = '\u0001';

/**
 * Turns a raw text pipe into a `Link`: JSON encoding, schema validation of everything received,
 * and splitting of large messages (a rejoin's input log) into ordered parts.
 */
export class TextLink implements Link {
  onMessage: ((msg: PeerMessage) => void) | null = null;
  onClose: (() => void) | null = null;
  private isOpen = true;
  private nextId = 1;
  private parts: string[] = [];
  private partId = '';

  constructor(
    readonly path: LinkPath,
    private readonly raw: (text: string) => void,
    private readonly rawClose: () => void = () => {},
  ) {}

  get open(): boolean {
    return this.isOpen;
  }

  send(msg: PeerMessage): void {
    if (!this.isOpen) return;
    const text = JSON.stringify(msg);
    if (text.length <= CHUNK) {
      this.raw(text);
      return;
    }
    const id = (this.nextId++).toString(36);
    const n = Math.ceil(text.length / CHUNK);
    for (let i = 0; i < n; i++) {
      this.raw(`${PART}${id}|${i}|${n}|${text.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    }
  }

  /** Feed one frame received from the pipe. Malformed frames are dropped. */
  receive(text: string): void {
    if (!this.isOpen) return;
    if (text.startsWith(PART)) {
      const m = /^.([0-9a-z]+)\|(\d+)\|(\d+)\|/.exec(text);
      if (!m) return;
      const [head, id, i, n] = m as unknown as [string, string, string, string];
      if (i === '0') {
        this.partId = id;
        this.parts = [];
      }
      if (id !== this.partId || Number(i) !== this.parts.length) return;
      this.parts.push(text.slice(head.length));
      if (this.parts.length < Number(n)) return;
      text = this.parts.join('');
      this.parts = [];
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    const parsed = PeerMessageSchema.safeParse(raw);
    if (parsed.success) this.onMessage?.(parsed.data);
  }

  /** The pipe went away (or `close()` was called): fires `onClose` once. */
  closed(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onClose?.();
  }

  close(): void {
    if (!this.isOpen) return;
    this.rawClose();
    this.closed();
  }
}

/**
 * Two linked in-memory links (tests, and the host's own seat). Delivery is asynchronous by default
 * like a real channel; `sync` delivers immediately for deterministic unit tests.
 */
export function linkPair(path: LinkPath = 'local', sync = false): [TextLink, TextLink] {
  const deliver = (fn: () => void) => (sync ? fn() : queueMicrotask(fn));
  // eslint-disable-next-line prefer-const
  let b: TextLink;
  const a: TextLink = new TextLink(
    path,
    (t) => deliver(() => b.receive(t)),
    () => deliver(() => b.closed()),
  );
  b = new TextLink(
    path,
    (t) => deliver(() => a.receive(t)),
    () => deliver(() => a.closed()),
  );
  return [a, b];
}

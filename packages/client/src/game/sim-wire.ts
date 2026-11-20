import type {
  EffectEvent,
  EntityView,
  Input,
  PeerMessage,
  PeerStart,
  ProcessCounts,
  Rect,
  RenderSnapshot,
} from '@mudders/shared';
import type { WorldOptions } from '@mudders/sim';
import type { StartInfo } from '../net/lockstep';
import type { HudState, SimPerf, WorldView } from './match';

/**
 * What crosses between the page and the sim worker (`sim-worker.ts`).
 *
 * The worker owns the whole match: the World, the turn clock and, online, the lockstep log. The
 * page sends it inputs and wall-clock time and gets back one packet per simulated tick. A packet
 * is a render snapshot with the cells cut down to what changed: the dirty rectangles' rows of the
 * terrain, coating and shade layers and the gas rectangle's rows, copied into one buffer that is
 * handed over, not cloned. The page patches them into its own copy of the map (`SnapshotMirror`)
 * and gives the renderer an ordinary snapshot. Buffers travel back with the next message and are
 * used again, so a steady match allocates nothing per tick.
 *
 * Shared memory would save the copy, but it needs cross-origin isolation headers that GitHub
 * Pages does not send.
 */

/** One tick's render snapshot on the wire. */
export interface TickPacket {
  tick: number;
  turn: number;
  width: number;
  height: number;
  /** Dirty rects, clipped to the map; their cells follow each other in `buf`. */
  rects: Rect[];
  gasRect: Rect | null;
  hasShade: boolean;
  entities: EntityView[];
  effectEvents: EffectEvent[];
  debris: { count: number; rigid?: number; hasShade: boolean };
  wind: number;
  temperature?: number | undefined;
  deathZone?: number | undefined;
  preview?: number[] | undefined;
  birds?: readonly number[] | undefined;
  theme: string;
  weather?: RenderSnapshot['weather'];
  processes?: Partial<ProcessCounts> | undefined;
  /** The world's loose ends at this tick (what `match.world` is while listeners see the tick). */
  view: RemoteView;
  /**
   * Debris x, y, vx as Int32 (count each), then bytes: per dirty rect its terrain rows, coating
   * rows and (with `hasShade`) shade rows; the gas rect's rows; debris material and shade.
   */
  buf: ArrayBuffer;
}

/**
 * The match view's copy of the world's loose ends, with the online figures of its side. On the
 * wire it has no `weaponId`; the page adds that from its own content.
 */
export interface RemoteView extends Omit<WorldView, 'weaponId'> {
  /** Guest: own player, ticks behind the host's permit, rebuilds from the host's log. */
  you?: number;
  lag?: number;
  rebuilds?: number;
  /** Host: resyncs sent. */
  desyncs?: number;
}

export type MatchSpec =
  | { kind: 'local'; options: WorldOptions }
  | { kind: 'host'; start: StartInfo; me: number }
  | { kind: 'guest'; start: PeerStart };

/** Page → worker. */
export type ToSim =
  | { t: 'create'; id: number; spec: MatchSpec }
  | { t: 'dispose'; id: number }
  | { t: 'advance'; id: number; dt: number; bufs: ArrayBuffer[] }
  | { t: 'input'; id: number; player: number; input: Input }
  | { t: 'limit'; id: number; ms: number }
  | { t: 'timing'; id: number; on: boolean }
  | { t: 'hash'; id: number; n: number }
  // host
  | { t: 'attach'; id: number; player: number; link: number; haveTick: number }
  | { t: 'detach'; id: number; player: number }
  | { t: 'submit'; id: number; player: number; action: Input }
  | { t: 'fromGuest'; id: number; player: number; msg: PeerMessage }
  // guest
  | { t: 'fromHost'; id: number; msg: PeerMessage }
  | { t: 'resume'; id: number };

/** Worker → page. */
export type FromSim =
  /** The worker has loaded the content and takes matches. */
  | { t: 'ready' }
  | { t: 'tick'; id: number; packet: TickPacket }
  | {
      t: 'state';
      id: number;
      view: RemoteView;
      /** Only when it differs from the last one sent. */
      hud?: HudState;
      shed: number;
      /** The first state of a match: its world is built. */
      ready?: boolean;
      /** Answers an `advance`: the render time it returned and the ms it took. */
      ack?: { at: number; ms: number };
      /** While the recorder times the sim. */
      perf?: SimPerf;
    }
  | { t: 'failed'; id: number; error: string }
  | { t: 'hash'; id: number; n: number; tick: number; hash: string }
  /** Host: a message for the guest on this link. */
  | { t: 'toGuest'; id: number; link: number; msg: PeerMessage }
  /** Guest: a message for the host. */
  | { t: 'toHost'; id: number; msg: PeerMessage }
  | { t: 'desync'; id: number; player: number };

/** Buffers kept for the next packets (worker side). */
export class BufferPool {
  private free: ArrayBuffer[] = [];

  constructor(private readonly keep = 8) {}

  /** A buffer of at least `bytes` (its contents are whatever the last packet left). */
  take(bytes: number): ArrayBuffer {
    let best = -1;
    let bestSize = Infinity;
    for (const [i, b] of this.free.entries()) {
      if (b.byteLength >= bytes && b.byteLength < bestSize) {
        best = i;
        bestSize = b.byteLength;
      }
    }
    const found = best >= 0 ? this.free.splice(best, 1)[0] : undefined;
    // a new one is rounded up, so a patch that grows a little next tick still fits
    return found ?? new ArrayBuffer(Math.max(4096, (bytes + (bytes >> 2) + 4095) & ~4095));
  }

  give(buf: ArrayBuffer): void {
    if (buf.byteLength === 0) return; // detached
    this.free.push(buf);
    if (this.free.length > this.keep) {
      // drop the smallest: the big ones are the dear ones to make again
      let small = 0;
      let smallSize = Infinity;
      for (const [i, b] of this.free.entries()) {
        if (b.byteLength < smallSize) {
          small = i;
          smallSize = b.byteLength;
        }
      }
      this.free.splice(small, 1);
    }
  }
}

function clip(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(width, r.x + r.w);
  const y1 = Math.min(height, r.y + r.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function copyOut(src: Uint8Array, width: number, r: Rect, out: Uint8Array, at: number): number {
  if (r.w === width) {
    out.set(src.subarray(r.y * width, (r.y + r.h) * width), at);
    return at + r.w * r.h;
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    const o = y * width + r.x;
    out.set(src.subarray(o, o + r.w), at);
    at += r.w;
  }
  return at;
}

function copyIn(dst: Uint8Array, width: number, r: Rect, src: Uint8Array, at: number): number {
  if (r.w === width) {
    dst.set(src.subarray(at, at + r.w * r.h), r.y * width);
    return at + r.w * r.h;
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    dst.set(src.subarray(at, at + r.w), y * width + r.x);
    at += r.w;
  }
  return at;
}

/** Pack a snapshot for the page (worker side). The packet's `buf` is to be transferred. */
export function encodeTick(s: RenderSnapshot, pool: BufferPool, view: RemoteView): TickPacket {
  const { width, height } = s;
  const rects: Rect[] = [];
  let cells = 0;
  for (const d of s.dirtyRects) {
    const r = clip(d, width, height);
    if (!r) continue;
    rects.push(r);
    cells += r.w * r.h;
  }
  const gasRect = s.gasRect ? clip(s.gasRect, width, height) : null;
  const shade = s.shade;
  const n = s.debris.count;
  const dShade = s.debris.shade;
  const ints = n * 3;
  const bytes =
    cells * (shade ? 3 : 2) + (gasRect ? gasRect.w * gasRect.h : 0) + n * (dShade ? 2 : 1);
  const buf = pool.take(ints * 4 + bytes);
  if (n > 0) {
    const i32 = new Int32Array(buf, 0, ints);
    i32.set(s.debris.x.subarray(0, n), 0);
    i32.set(s.debris.y.subarray(0, n), n);
    i32.set(s.debris.vx.subarray(0, n), n * 2);
  }
  const out = new Uint8Array(buf, ints * 4, bytes);
  let at = 0;
  for (const r of rects) {
    at = copyOut(s.terrain, width, r, out, at);
    at = copyOut(s.coating, width, r, out, at);
    if (shade) at = copyOut(shade, width, r, out, at);
  }
  if (gasRect) at = copyOut(s.gas, width, gasRect, out, at);
  if (n > 0) {
    out.set(s.debris.material.subarray(0, n), at);
    at += n;
    if (dShade) out.set(dShade.subarray(0, n), at);
  }
  return {
    tick: s.tick,
    turn: s.turn,
    width,
    height,
    rects,
    gasRect,
    hasShade: shade !== undefined,
    entities: s.entities,
    effectEvents: s.effectEvents,
    debris: {
      count: n,
      ...(s.debris.rigid !== undefined ? { rigid: s.debris.rigid } : {}),
      hasShade: dShade !== undefined,
    },
    wind: s.wind,
    temperature: s.temperature,
    deathZone: s.deathZone,
    preview: s.preview,
    birds: s.birds,
    theme: s.theme,
    weather: s.weather,
    processes: s.processes,
    view,
    buf,
  };
}

/**
 * The page's copy of the map, kept current by the packets. `apply` gives back the snapshot a
 * renderer would have got from the world itself: the same arrays every tick, changed in place,
 * with the tick's dirty rects.
 */
export class SnapshotMirror {
  private terrain = new Uint8Array(0);
  private coating = new Uint8Array(0);
  private gas = new Uint8Array(0);
  private shade = new Uint8Array(0);
  private dx = new Int32Array(0);
  private dy = new Int32Array(0);
  private dvx = new Int32Array(0);
  private dmat = new Uint8Array(0);
  private dshade = new Uint8Array(0);
  /** The last snapshot applied, or null before the first. */
  last: RenderSnapshot | null = null;

  apply(p: TickPacket): RenderSnapshot {
    const { width, height } = p;
    const size = width * height;
    if (this.terrain.length !== size) {
      this.terrain = new Uint8Array(size);
      this.coating = new Uint8Array(size);
      this.gas = new Uint8Array(size);
      this.shade = new Uint8Array(size);
    }
    const n = p.debris.count;
    if (this.dx.length < n) {
      const cap = Math.max(n, this.dx.length * 2, 256);
      this.dx = new Int32Array(cap);
      this.dy = new Int32Array(cap);
      this.dvx = new Int32Array(cap);
      this.dmat = new Uint8Array(cap);
      this.dshade = new Uint8Array(cap);
    }
    const ints = n * 3;
    if (n > 0) {
      const i32 = new Int32Array(p.buf, 0, ints);
      this.dx.set(i32.subarray(0, n));
      this.dy.set(i32.subarray(n, n * 2));
      this.dvx.set(i32.subarray(n * 2, ints));
    }
    const src = new Uint8Array(p.buf, ints * 4);
    let at = 0;
    for (const r of p.rects) {
      at = copyIn(this.terrain, width, r, src, at);
      at = copyIn(this.coating, width, r, src, at);
      if (p.hasShade) at = copyIn(this.shade, width, r, src, at);
    }
    if (p.gasRect) at = copyIn(this.gas, width, p.gasRect, src, at);
    if (n > 0) {
      this.dmat.set(src.subarray(at, at + n));
      at += n;
      if (p.debris.hasShade) this.dshade.set(src.subarray(at, at + n));
    }
    const s: RenderSnapshot = {
      tick: p.tick,
      turn: p.turn,
      width,
      height,
      terrain: this.terrain,
      coating: this.coating,
      gas: this.gas,
      gasRect: p.gasRect,
      processes: p.processes,
      ...(p.hasShade ? { shade: this.shade } : {}),
      dirtyRects: p.rects,
      entities: p.entities,
      effectEvents: p.effectEvents,
      debris: {
        count: n,
        ...(p.debris.rigid !== undefined ? { rigid: p.debris.rigid } : {}),
        x: this.dx,
        y: this.dy,
        vx: this.dvx,
        material: this.dmat,
        ...(p.debris.hasShade ? { shade: this.dshade } : {}),
      },
      wind: p.wind,
      temperature: p.temperature,
      deathZone: p.deathZone,
      preview: p.preview,
      ...(p.birds ? { birds: p.birds } : {}),
      theme: p.theme,
      weather: p.weather,
    };
    this.last = s;
    return s;
  }

  /** The last snapshot again with the whole map marked dirty, for a renderer that mounts late. */
  full(): RenderSnapshot | null {
    const s = this.last;
    if (!s) return null;
    const all = { x: 0, y: 0, w: s.width, h: s.height };
    return { ...s, dirtyRects: [all], gasRect: all, effectEvents: [] };
  }
}

import { PROCESS_KINDS, type ProcessCounts, type RenderSnapshot } from '@mudders/shared';

/** Ticks between full-map counts of burning and molten cells (they change slowly). */
const SCAN_EVERY = 20;
/** Per tick, how much of the old flow rate is kept (a short moving average). */
const FLOW_KEEP = 0.85;
/** Gas clouds hiss at full strength while fresh, then settle to this share as they linger. */
const GAS_LINGER = 0.3;
const GAS_FRESH_TICKS = 600;

const LOOK_HOT = 2;
const LOOK_FLAMES = 4;

/**
 * Measures the world's ongoing processes from what the renderer already sees (cosmetic, client
 * only, no sim changes): burning and molten cells from the material looks, liquid cells that
 * moved from the dirty rects, and gas from the clouds. The soundscape plays from these counts.
 * A snapshot's own `processes` (filled in by the sim, when it measures one) wins where larger.
 */
export class ProcessMeter {
  private readonly liquid = new Uint8Array(256);
  /** 1 where a liquid cell was at the last snapshot (only rects that changed are compared). */
  private readonly wet: Uint8Array;
  private flags: Uint8Array = new Uint8Array(256);
  private burning = 0;
  private boiling = 0;
  private flow = 0;
  private lastScan = -Infinity;
  private lastTick = -1;
  private synced = false;
  readonly counts: ProcessCounts = { burning: 0, boiling: 0, flowing: 0, gassing: 0, quenching: 0 };

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.wet = new Uint8Array(width * height);
  }

  /** Material look flags per cell id (2 hot, 4 flames) and the liquid cell ids. */
  setLooks(flags: Uint8Array, liquids: readonly number[]): void {
    this.flags = flags;
    this.liquid.fill(0);
    for (const c of liquids) if (c > 0 && c < 256) this.liquid[c] = 1;
    this.lastScan = -Infinity;
  }

  /** Forget everything (a new map). */
  reset(): void {
    this.synced = false;
    this.flow = 0;
    this.lastScan = -Infinity;
    this.lastTick = -1;
  }

  /**
   * Update from a snapshot; returns the counts (the same object each call). `heat`: whether the
   * map holds any hot or flaming cells at all (the renderer knows from its own look scan), so a
   * map without fire never pays for the count.
   */
  update(s: RenderSnapshot, heat = true): ProcessCounts {
    const w = this.width;
    const t = s.terrain;
    if (s.width !== w || s.height !== this.height) return this.counts;
    const ticks = this.lastTick < 0 ? 1 : Math.max(1, s.tick - this.lastTick);
    this.lastTick = s.tick;
    // liquid that moved: cells inside the changed rects that became wet or dry
    let moved = 0;
    const liq = this.liquid;
    const wet = this.wet;
    if (!this.synced) {
      for (let i = 0; i < t.length; i++) wet[i] = liq[t[i]!]!;
      this.synced = true;
    } else {
      for (const r of s.dirtyRects) {
        const whole = r.x === 0 && r.y === 0 && r.w >= w && r.h >= this.height;
        const y1 = Math.min(this.height, r.y + r.h);
        const x1 = Math.min(w, r.x + r.w);
        for (let y = Math.max(0, r.y); y < y1; y++) {
          for (let i = y * w + Math.max(0, r.x), e = y * w + x1; i < e; i++) {
            const now = liq[t[i]!]!;
            if (now !== wet[i]) {
              wet[i] = now;
              moved++;
            }
          }
        }
        // a whole new map is not a flood
        if (whole) moved = 0;
      }
    }
    // a cell moving is one leaving and one arriving: count moves, not both ends
    const rate = moved / 2 / ticks;
    this.flow = this.flow * FLOW_KEEP ** ticks + rate * (1 - FLOW_KEEP ** ticks);
    if (this.flow < 0.05) this.flow = 0;
    if (!heat) {
      this.burning = 0;
      this.boiling = 0;
      this.lastScan = -Infinity;
    } else if (s.tick - this.lastScan >= SCAN_EVERY || s.tick < this.lastScan) this.scan(s);

    let gas = 0;
    let volcano = 0;
    for (const e of s.entities) {
      if (e.kind !== 'zone') continue;
      if (e.look === 'gas' || e.look === 'toxic' || e.look === 'acid-cloud') {
        const age = e.age ?? 0;
        const k =
          age >= GAS_FRESH_TICKS ? GAS_LINGER : 1 - (1 - GAS_LINGER) * (age / GAS_FRESH_TICKS);
        const pr = e.puffRadius ?? 0;
        const n = e.puffs ? e.puffs.length / 2 : 0;
        const area = n > 0 && pr > 0 ? n * pr * pr * 3 : e.radius * e.radius * 3;
        gas += area * k;
      } else if (e.look === 'volcano') volcano += e.radius * 2;
    }

    const c = this.counts;
    c.burning = this.burning;
    c.boiling = this.boiling + volcano;
    c.flowing = this.flow;
    c.gassing = Math.round(gas);
    c.quenching = 0;
    const sim = s.processes;
    if (sim) {
      for (const k of PROCESS_KINDS) {
        const v = sim[k];
        if (v !== undefined && v > c[k]) c[k] = v;
      }
    }
    return c;
  }

  /** Count burning cells and molten cells open to the air across the map. */
  private scan(s: RenderSnapshot): void {
    this.lastScan = s.tick;
    const f = this.flags;
    const t = s.terrain;
    const co = s.coating;
    const w = this.width;
    let burning = 0;
    let boiling = 0;
    for (let i = 0; i < t.length; i++) {
      const m = f[t[i]!]! | f[co[i]!]!;
      if (m === 0) continue;
      if ((m & LOOK_FLAMES) !== 0) burning++;
      else if ((m & LOOK_HOT) !== 0 && i >= w && t[i - w] === 0) boiling++;
    }
    this.burning = burning;
    this.boiling = boiling;
  }
}

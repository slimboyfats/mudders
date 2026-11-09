/**
 * The liquid surface layer (step 3 of the GPU effects plan, CPU-side: a map's surface is one
 * row per column, which a typed array handles in well under a millisecond).
 *
 * Every pool of water, oil, lava or tar carries a one-dimensional wave field along its surface:
 * a height and a velocity per column, stepped with the wave equation each tick, so splashes,
 * blasts and wading tanks send real waves that run, meet, interfere and bounce off the banks,
 * instead of the fixed rings the splash code draws. On top of that the surface has a sheen:
 * glints sliding along the water with the wind, the lava's crust glowing and bursting in slow
 * bubbles that throw embers, tar blowing lazy bubbles that plop. All of it is cosmetic, seeded
 * from the tick, and drawn as whole cells: a crest is a stack of liquid cells over the surface,
 * a trough a dark run of cells under it.
 */
import type { QuadBatch } from './batch';
import { PKind, type ParticleSink } from './particles';
import { shade } from './theme';

/** What kind of liquid a material is to this layer. */
export const LIQUID_NONE = 0;
/** Cold, thin and quick: water, oil, liquid dirt. */
export const LIQUID_COLD = 1;
/** Lava: slow, heavy, glowing, bubbling. */
export const LIQUID_HOT = 2;
/** Mud and wet clay: a sluggish slurry. */
export const LIQUID_HEAVY = 3;

/** Per kind: wave speed² (cells²/tick²), velocity damping, height decay, glint rate. */
const WAVE = [
  { c2: 0, damp: 0, decay: 0, glint: 0 },
  { c2: 0.3, damp: 0.985, decay: 0.992, glint: 0.06 },
  { c2: 0.08, damp: 0.93, decay: 0.985, glint: 0.04 },
  { c2: 0.06, damp: 0.9, decay: 0.98, glint: 0.015 },
] as const;

/** Ticks between surface rescans (the terrain only changes a little between them). */
const SCAN_EVERY = 4;
const MAX_BUBBLES = 48;
const MAX_H = 4;

interface Bubble {
  x: number;
  start: number;
  kind: number;
  /** Full size in cells (1..3). */
  size: number;
}

function hash(a: number, b: number): number {
  let x = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return (x ^ (x >>> 15)) >>> 0;
}

export class LiquidSurface {
  /** Kind per material cell value. */
  private readonly kinds = new Uint8Array(256);
  private terrain: Uint8Array;
  /** Surface row per column (-1 = no liquid surface in this column). */
  private readonly sy: Int16Array;
  /** Kind and material per column. */
  private readonly kind: Uint8Array;
  private readonly mat: Uint8Array;
  private h: Float32Array;
  private hn: Float32Array;
  private readonly v: Float32Array;
  private bubbles: Bubble[] = [];
  private scanned = -1;
  /** Any liquid surface at all after the last scan. */
  private any = false;
  /** Particle budget scale from the quality level. */
  mult = 1;

  constructor(
    private readonly width: number,
    private readonly height: number,
    cold: readonly number[],
    hot: readonly number[],
    heavy: readonly number[],
    private readonly colors: Uint32Array,
  ) {
    for (const c of cold) if (c > 0 && c < 256) this.kinds[c] = LIQUID_COLD;
    for (const c of hot) if (c > 0 && c < 256) this.kinds[c] = LIQUID_HOT;
    for (const c of heavy) if (c > 0 && c < 256) this.kinds[c] = LIQUID_HEAVY;
    this.terrain = new Uint8Array(width * height);
    this.sy = new Int16Array(width).fill(-1);
    this.kind = new Uint8Array(width);
    this.mat = new Uint8Array(width);
    this.h = new Float32Array(width);
    this.hn = new Float32Array(width);
    this.v = new Float32Array(width);
  }

  get enabled(): boolean {
    for (let i = 1; i < 256; i++) if (this.kinds[i]) return true;
    return false;
  }

  setTerrain(t: Uint8Array): void {
    this.terrain = t;
    this.scanned = -1;
  }

  private cell(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.terrain[y * this.width + x]!;
  }

  /** Height of the surface wave in column x (cells; positive is raised). */
  heightAt(x: number): number {
    return x >= 0 && x < this.width ? this.h[x]! : 0;
  }

  /** The surface row in column x, or -1. */
  surfaceAt(x: number): number {
    return x >= 0 && x < this.width ? this.sy[x]! : -1;
  }

  /** Find the top liquid cell with air above it in every column. */
  private scan(): void {
    const w = this.width;
    const hgt = this.height;
    const t = this.terrain;
    const k = this.kinds;
    this.any = false;
    for (let x = 0; x < w; x++) {
      let found = -1;
      let above = 0;
      for (let y = 0; y < hgt; y++) {
        const c = t[y * w + x]!;
        if (above === 0 && k[c] !== 0) {
          found = y;
          break;
        }
        above = c;
      }
      const prev = this.sy[x]!;
      this.sy[x] = found;
      if (found < 0) {
        this.kind[x] = 0;
        this.h[x] = 0;
        this.v[x] = 0;
        continue;
      }
      const m = t[found * w + x]!;
      this.mat[x] = m;
      this.kind[x] = k[m]!;
      this.any = true;
      // a pool that moved a long way (drained, refilled) starts its waves afresh
      if (prev < 0 || Math.abs(prev - found) > 3) {
        this.h[x] = 0;
        this.v[x] = 0;
      }
    }
  }

  /** Whether columns a and b share a surface the waves can cross. */
  private joined(a: number, b: number): boolean {
    if (b < 0 || b >= this.width) return false;
    const sb = this.sy[b]!;
    return sb >= 0 && this.kind[b] === this.kind[a] && Math.abs(sb - this.sy[a]!) <= 2;
  }

  /** Kick the surface near (x, y) with a wave of height `amp` (cells). */
  disturb(x: number, y: number, amp: number): void {
    const cx = Math.round(x);
    if (cx < 0 || cx >= this.width) return;
    const s = this.sy[cx]!;
    if (s < 0 || Math.abs(s - y) > 4) return;
    const a = Math.min(MAX_H, amp);
    // the hit drives the surface down and shoves the water either side up; the pushes sum to
    // zero so the pool's level stays where it is
    this.h[cx] = Math.max(-MAX_H, this.h[cx]! - a);
    this.v[cx] = this.v[cx]! - a * 0.6;
    for (const d of [-1, 1]) {
      if (this.joined(cx, cx + d)) this.v[cx + d] = this.v[cx + d]! + a * 0.3;
    }
  }

  /** A blast shoves every bit of surface in its reach, hardest at the centre. */
  blast(x: number, y: number, r: number): void {
    const R = Math.round(r * 1.5 + 3);
    const x0 = Math.max(0, Math.round(x - R));
    const x1 = Math.min(this.width - 1, Math.round(x + R));
    // the shove, hardest under the blast; it is taken back evenly over the touched columns so
    // the pool's level stays where it is and only waves remain
    let sum = 0;
    let n = 0;
    for (let cx = x0; cx <= x1; cx++) {
      const s = this.sy[cx]!;
      if (s < 0) continue;
      const dx = cx - x;
      const dy = s - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R) continue;
      const k = 1 - d / R;
      const push = (dy < 0 ? 1 : -1) * k * r * 0.05;
      this.v[cx] = this.v[cx]! + push;
      sum += push;
      n++;
    }
    if (n > 1) {
      const mean = sum / n;
      for (let cx = x0; cx <= x1; cx++) {
        const s = this.sy[cx]!;
        if (s < 0) continue;
        const dx = cx - x;
        const dy = s - y;
        if (dx * dx + dy * dy > R * R) continue;
        this.v[cx] = this.v[cx]! - mean;
      }
    }
  }

  /** One sim tick: rescan now and then, run the waves, breathe the wind, blow bubbles. */
  tick(t: number, wind: number, sink: ParticleSink): void {
    if (this.scanned < 0 || t - this.scanned >= SCAN_EVERY) {
      this.scan();
      this.scanned = t;
    }
    if (!this.any) return;
    const w = this.width;
    const h = this.h;
    const hn = this.hn;
    const v = this.v;
    // one explicit step of the wave equation from the old heights (a Jacobi step: reading the
    // neighbours already updated this tick would feed the wave energy and blow it up)
    for (let x = 0; x < w; x++) {
      const k = this.kind[x]!;
      if (k === 0) {
        hn[x] = 0;
        continue;
      }
      const p = WAVE[k]!;
      const hx = h[x]!;
      const hl = this.joined(x, x - 1) ? h[x - 1]! : hx;
      const hr = this.joined(x, x + 1) ? h[x + 1]! : hx;
      let vx = (v[x]! + p.c2 * (hl + hr - 2 * hx)) * p.damp;
      // the wind ruffles cold water: a slow chop that runs downwind
      if (k === LIQUID_COLD && wind !== 0) {
        const r = hash(x - Math.round(t * wind * 60), 5);
        if ((r & 31) === 0) vx += wind * 24 * ((r >>> 5) & 1 ? 1 : -1);
      }
      v[x] = vx;
      let nh = (hx + vx) * p.decay;
      if (nh > MAX_H) nh = MAX_H;
      else if (nh < -MAX_H) nh = -MAX_H;
      hn[x] = nh;
    }
    this.h = hn;
    this.hn = h;
    this.stepBubbles(t, sink);
  }

  private stepBubbles(t: number, sink: ParticleSink): void {
    // new bubbles: lava often, tar now and then, one column at a time
    if (t % 3 === 0 && this.bubbles.length < MAX_BUBBLES) {
      const r = hash(t, 11);
      const x = r % this.width;
      const k = this.kind[x]!;
      if (k === LIQUID_HOT || k === LIQUID_HEAVY) {
        const chance = k === LIQUID_HOT ? 0.5 : 0.2;
        if (((r >>> 10) & 255) / 255 < chance * Math.max(0.3, this.mult)) {
          this.bubbles.push({ x, start: t, kind: k, size: 1 + ((r >>> 20) % 3) });
        }
      }
    }
    this.bubbles = this.bubbles.filter((b) => {
      const age = t - b.start;
      const life = b.kind === LIQUID_HOT ? 14 + b.size * 4 : 24 + b.size * 6;
      if (age < life) return true;
      // pop: a dip in the surface, and what the burst throws
      const s = this.sy[b.x]!;
      if (s < 0) return false;
      this.disturb(b.x, s, 0.4 + b.size * 0.3);
      const n = Math.round(b.size * (b.kind === LIQUID_HOT ? 2 : 1) * Math.max(0.3, this.mult));
      for (let i = 0; i < n; i++) {
        const r = hash(b.x * 7 + i, t);
        const u = (r & 255) / 255;
        if (b.kind === LIQUID_HOT) {
          sink.add({
            x: b.x + ((r >>> 8) % 3) - 1,
            y: s - b.size - 1,
            vx: (u - 0.5) * 0.8,
            vy: -(0.6 + (((r >>> 12) & 255) / 255) * 1.2),
            life: 24 + ((r >>> 20) & 31),
            size: 1,
            color: (r >>> 16) & 1 ? 0xffe070 : 0xff7a24,
            kind: PKind.Ember,
          });
        } else {
          sink.add({
            x: b.x + ((r >>> 8) % 3) - 1,
            y: s - b.size - 1,
            vx: (u - 0.5) * 0.6,
            vy: -(0.3 + (((r >>> 12) & 255) / 255) * 0.5),
            life: 16 + ((r >>> 20) & 15),
            size: 1,
            color: shade(this.colors[this.mat[b.x]!] ?? 0x6a4a2a, 1.2),
            kind: PKind.Chunk,
          });
        }
      }
      return false;
    });
  }

  /** Crests, troughs, slope light, glints and bubbles, all as whole cells on the surface. */
  draw(normal: QuadBatch, additive: QuadBatch, t: number): void {
    if (!this.any) return;
    const w = this.width;
    const h = this.h;
    for (let x = 0; x < w; x++) {
      const k = this.kind[x]!;
      if (k === 0) continue;
      const s = this.sy[x]!;
      const col = this.colors[this.mat[x]!] ?? 0x3a78c8;
      const lit = shade(col, 1.35);
      const dark = shade(col, 0.68);
      const bright = k === LIQUID_COLD ? 0xf2f8ff : k === LIQUID_HOT ? 0xfff0a0 : shade(col, 1.6);
      const d = Math.round(h[x]!);
      const px = x + 0.5;
      if (d > 0) {
        // a crest: liquid stacked over the surface, its top lit
        for (let j = 1; j <= d; j++) {
          if (this.cell(x, s - j) !== 0) break;
          normal.push(px, s - j + 0.5, 1, 1, j === d ? lit : col, 1);
        }
      } else if (d < 0) {
        // a trough: the surface sinks dark
        for (let j = 0; j < -d; j++) {
          if (this.kinds[this.cell(x, s + j)] !== k) break;
          normal.push(px, s + j + 0.5, 1, 1, dark, 1);
        }
      }
      // slope light: the face toward the sun (up-left) catches it, the lee side shades
      const hl = this.joined(x, x - 1) ? h[x - 1]! : h[x]!;
      const hr = this.joined(x, x + 1) ? h[x + 1]! : h[x]!;
      const slope = hl - hr;
      if (slope > 0.5 && d <= 0) normal.push(px, s + 0.5, 1, 1, lit, 1);
      else if (slope < -0.5 && d >= 0) normal.push(px, s + 0.5, 1, 1, dark, 1);
      // the sheen
      const p = WAVE[k]!;
      if (k === LIQUID_COLD) {
        // glints slide along the water, a bright cell and a paler one trailing it
        const g = hash(x - (t >> 1), 3);
        if ((g & 1023) / 1023 < p.glint * 0.5) {
          additive.push(px, s + 0.5, 1, 1, bright, 0.55);
          if (this.joined(x, x + 1)) additive.push(px + 1, s + 0.5, 1, 1, bright, 0.25);
        }
      } else if (k === LIQUID_HOT) {
        // the crust: cells glow up and cool down in slow steps
        const g = hash(x, t >> 3);
        if ((g & 1023) / 1023 < p.glint) additive.push(px, s + 0.5, 1, 1, bright, 0.5);
        else if (((g >>> 10) & 1023) / 1023 < p.glint) normal.push(px, s + 0.5, 1, 1, dark, 1);
      } else {
        // tar: a dull wet shine now and then
        const g = hash(x - (t >> 3), 7);
        if ((g & 1023) / 1023 < p.glint) normal.push(px, s + 0.5, 1, 1, shade(col, 1.25), 1);
      }
    }
    // bubbles: a dome swelling out of the surface
    for (const b of this.bubbles) {
      const s = this.sy[b.x]!;
      if (s < 0) continue;
      const age = t - b.start;
      const life = b.kind === LIQUID_HOT ? 14 + b.size * 4 : 24 + b.size * 6;
      const r = Math.min(b.size, 1 + Math.floor((age / life) * (b.size + 1)));
      const col = this.colors[this.mat[b.x]!] ?? 0x3a78c8;
      const lit = shade(col, b.kind === LIQUID_HOT ? 1.5 : 1.25);
      for (let ox = -r; ox <= r; ox++) {
        // only over the same pool, never past its bank or the map edge
        if (!this.joined(b.x, b.x + ox)) continue;
        const hy = r - Math.abs(ox);
        for (let j = 1; j <= hy; j++) {
          if (this.cell(b.x + ox, s - j) !== 0) break;
          normal.push(b.x + ox + 0.5, s - j + 0.5, 1, 1, j === hy && ox <= 0 ? lit : col, 1);
        }
      }
      if (b.kind === LIQUID_HOT) additive.push(b.x + 0.5, s - r + 0.5, 1, 1, 0xfff0a0, 0.6);
    }
  }

  clear(): void {
    this.h.fill(0);
    this.v.fill(0);
    this.bubbles = [];
    this.scanned = -1;
  }
}

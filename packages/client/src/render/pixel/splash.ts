import type { EffectEvent, EntityView } from '@mudders/shared';
import type { QuadBatch } from './batch';
import { shade } from './theme';

/**
 * Water splashes and ripples (§2a): shells, blasts and tanks that hit a pool of water (or any
 * other cold liquid: liquid dirt, oil) throw a crown of droplets, and rings of waves run out
 * along the pool's surface, bounce off its banks and die down.
 *
 * Purely cosmetic and renderer-side: it watches the snapshot stream (shell paths, tank moves,
 * blast events and the terrain grid) and never feeds back into the sim. Everything is seeded from
 * the tick and the entity, and stepped once per sim tick, so captures replay byte-identically.
 * Everything snaps to map cells; waves are hard-banded cells on the surface row.
 */

/** Most droplets in flight at once; the oldest slot is reused when full (cosmetic). */
const MAX_DROPS = 1200;
/** Most waves alive at once. */
const MAX_WAVES = 48;
/** How fast a wave runs along the surface, in cells per tick. */
const WAVE_SPEED = 0.6;
/** A wave's life in ticks at full strength. */
const WAVE_LIFE = 120;
/** Gap in cells between the rings of one splash. */
const RING_GAP = 6;
/** Furthest a wave looks for its pool's banks, in cells. */
const MAX_REACH = 260;
const DROP_GRAVITY = 0.16;

/** Foam white. */
const FOAM = 0xf2f8ff;

interface Wave {
  x: number;
  /** Surface row (the top liquid cell) where it started. */
  y: number;
  start: number;
  /** Height at the start: about 0.3 for a raindrop-sized plink, 3 for a nuke. */
  amp: number;
  /** Cells of open surface to the bank on each side. */
  left: number;
  right: number;
  /** Liquid colour. */
  color: number;
}

/** Integer hash → uint32. */
function hash(a: number, b: number): number {
  let x = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return (x ^ (x >>> 15)) >>> 0;
}

/** Position on a wave front of travel `d` that bounces between banks `ext` cells away. */
export function bounce(d: number, ext: number): { pos: number; hits: number } {
  if (ext <= 0) return { pos: 0, hits: 99 };
  const hits = Math.floor(d / ext);
  const m = d - hits * ext;
  return { pos: (hits & 1) === 0 ? m : ext - m, hits };
}

export class WaterFx {
  /** 1 for liquid material cells that splash. */
  private readonly liquid = new Uint8Array(256);
  private terrain: Uint8Array;
  private readonly dx = new Float32Array(MAX_DROPS);
  private readonly dy = new Float32Array(MAX_DROPS);
  private readonly dvx = new Float32Array(MAX_DROPS);
  private readonly dvy = new Float32Array(MAX_DROPS);
  private readonly dage = new Uint16Array(MAX_DROPS);
  private readonly dlife = new Uint16Array(MAX_DROPS);
  private readonly dcolor = new Uint32Array(MAX_DROPS);
  private nDrops = 0;
  private waves: Wave[] = [];
  /** Last position of each shell in flight, by projectile id. */
  private shells = new Map<
    number,
    { x: number; y: number; vx: number; vy: number; seen: number }
  >();
  /** Last position of each tank, by player, and whether it stood in liquid. */
  private tanks: { x: number; y: number; wet: boolean }[] = [];
  /** Tick of the last splash sound cue, so a burst of splashes plays one sound. */
  private lastCue = -100;
  /** Sound cues (`waterSplash` events) since the last `drainCues`. */
  private cues: EffectEvent[] = [];
  /** Splashes thrown this tick (a hail of drops into one pool would fill the sky with spray). */
  private budgetTick = -1;
  private budget = 0;
  /** Particle budget scale from the quality level. */
  mult = 1;
  /** The wave field along the surface, if one is listening for splashes. */
  listener: { disturb(x: number, y: number, amp: number): void } | undefined;

  constructor(
    private readonly width: number,
    private readonly height: number,
    liquids: readonly number[],
    private readonly colors: Uint32Array,
  ) {
    for (const c of liquids) if (c > 0 && c < 256) this.liquid[c] = 1;
    this.terrain = new Uint8Array(width * height);
  }

  /** Any liquids at all (the map can still hold none of them). */
  get enabled(): boolean {
    for (let i = 1; i < 256; i++) if (this.liquid[i]) return true;
    return false;
  }

  setTerrain(t: Uint8Array): void {
    this.terrain = t;
  }

  private cell(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.terrain[y * this.width + x]!;
  }

  isLiquid(x: number, y: number): boolean {
    return this.liquid[this.cell(Math.floor(x), Math.floor(y))] === 1;
  }

  /** Depth of the liquid under the surface cell (x, sy), up to `max`. */
  private depth(x: number, sy: number, max: number): number {
    let d = 0;
    while (d < max && this.liquid[this.cell(x, sy + d)] === 1) d++;
    return d;
  }

  /** The top liquid cell of the column of liquid at (x, y). */
  private surface(x: number, y: number): number {
    let sy = y;
    while (sy > 0 && this.liquid[this.cell(x, sy - 1)] === 1) sy--;
    return sy;
  }

  /** Open water surface at (x, y): liquid with air above. */
  private open(x: number, y: number): boolean {
    return this.liquid[this.cell(x, y)] === 1 && this.cell(x, y - 1) === 0;
  }

  /** The surface row near `y` in column x, or -1 (the pool's level moves as it soaks away). */
  private surfaceNear(x: number, y: number): number {
    if (this.open(x, y)) return y;
    for (let d = 1; d <= 2; d++) {
      if (this.open(x, y + d)) return y + d;
      if (this.open(x, y - d)) return y - d;
    }
    return -1;
  }

  /** Cells of open surface from (x, y) towards `dir` before the bank. */
  private reach(x: number, y: number, dir: number): number {
    let n = 0;
    let row = y;
    while (n < MAX_REACH) {
      const nx = x + dir * (n + 1);
      const r = this.surfaceNear(nx, row);
      if (r < 0 || Math.abs(r - y) > 2) break;
      row = r;
      n++;
    }
    return n;
  }

  private colorAt(x: number, y: number): number {
    return this.colors[this.cell(x, y)] ?? 0x3a78c8;
  }

  private addDrop(x: number, y: number, vx: number, vy: number, life: number, color: number): void {
    let i = this.nDrops;
    if (i >= MAX_DROPS) {
      // reuse the oldest-looking slot (cosmetic)
      i = hash(Math.floor(x * 7 + y), Math.floor(vx * 100)) % MAX_DROPS;
    } else this.nDrops++;
    this.dx[i] = x;
    this.dy[i] = y;
    this.dvx[i] = vx;
    this.dvy[i] = vy;
    this.dage[i] = 0;
    this.dlife[i] = life;
    this.dcolor[i] = color;
  }

  private addWave(x: number, y: number, amp: number, t: number): void {
    if (this.waves.length >= MAX_WAVES) {
      // drop the weakest
      let k = 0;
      for (let i = 1; i < this.waves.length; i++) {
        if (this.waves[i]!.amp < this.waves[k]!.amp) k = i;
      }
      if (this.waves[k]!.amp > amp) return;
      this.waves.splice(k, 1);
    }
    this.listener?.disturb(x, y, amp);
    // two splashes on the same spot in the same moment merge into one bigger wave
    for (const w of this.waves) {
      if (t - w.start < 4 && Math.abs(w.x - x) < 4 && Math.abs(w.y - y) < 3) {
        w.amp = Math.min(3.5, Math.max(w.amp, amp) + Math.min(w.amp, amp) * 0.3);
        return;
      }
    }
    this.waves.push({
      x,
      y,
      start: t,
      amp,
      left: this.reach(x, y, -1),
      right: this.reach(x, y, 1),
      color: this.colorAt(x, y),
    });
  }

  /**
   * A splash at the surface cell (x, sy): a crown of droplets thrown up and out (biased along
   * `vx`, the incoming motion), a column in the middle for hard hits, and rings of waves.
   */
  splash(x: number, sy: number, strength: number, vx: number, t: number, seed: number): void {
    // a film of water an inch deep can't throw much: scale by depth
    const deep = this.depth(x, sy, 6);
    const s = Math.max(0.2, Math.min(4, strength * (0.35 + 0.65 * Math.min(1, deep / 5))));
    if (this.budgetTick !== t) {
      this.budgetTick = t;
      this.budget = 0;
    }
    this.budget++;
    // past a few splashes in one tick, the rest only ripple
    if (this.budget > 3) {
      if (this.budget < 12) this.addWave(x, sy, Math.min(1.2, 0.3 + s * 0.3), t);
      return;
    }
    const col = this.colorAt(x, sy);
    const lit = shade(col, 1.35);
    const pale = shade(col, 1.7);
    const n = Math.round((3 + s * 6) * this.mult);
    for (let i = 0; i < n; i++) {
      const r = hash(seed + i, t);
      const side = r & 1 ? 1 : -1;
      const u = ((r >>> 1) & 1023) / 1023;
      const v = ((r >>> 11) & 1023) / 1023;
      const sp = 0.3 + u * (0.4 + s * 0.35);
      const up = 0.6 + v * (0.5 + s * 0.5);
      const c =
        (r >>> 21) % 5 === 0 ? FOAM : (r >>> 21) % 3 === 0 ? pale : (r >>> 24) & 1 ? lit : col;
      this.addDrop(
        x + side * (0.5 + u * 1.5),
        sy - 1,
        side * sp + vx * 0.15,
        -up,
        40 + ((r >>> 25) & 31),
        c,
      );
    }
    // the column: a hard hit jets straight up
    if (s >= 1.4) {
      const m = Math.round((1 + s * 2.5) * this.mult);
      for (let i = 0; i < m; i++) {
        const r = hash(seed + 977 + i, t);
        const v = (r & 1023) / 1023;
        this.addDrop(
          x + ((r >>> 10) % 3) - 1,
          sy - 1,
          (((r >>> 12) & 255) / 255 - 0.5) * 0.3,
          -(1.3 + s * 0.6 + v * s * 0.6),
          60,
          (r >>> 20) & 1 ? FOAM : pale,
        );
      }
    }
    this.addWave(x, sy, Math.min(3.5, 0.5 + s * 0.6), t);
    if (s >= 0.6 && t - this.lastCue >= 4) {
      this.lastCue = t;
      this.cues.push({
        type: 'waterSplash',
        tick: t,
        x,
        y: sy,
        radius: 0,
        params: { strength: Math.round(Math.min(3, s) * 100) / 100 },
      });
    }
  }

  /** A blast near water throws spray off every bit of surface inside its reach. */
  blast(e: EffectEvent): void {
    if ((e.params.strength ?? 1) <= 0) return;
    // small pops (a water jet's impact) only splash, via the shell that made them
    if (e.radius < 6) return;
    const R = Math.round(e.radius * 1.6 + 4);
    const cx = e.x;
    const cy = e.y;
    let nearest = Infinity;
    let nx = 0;
    let ny = 0;
    const step = R > 40 ? 2 : 1;
    for (let x = cx - R; x <= cx + R; x += step) {
      if (x < 0 || x >= this.width) continue;
      for (let y = Math.max(1, cy - R); y <= Math.min(this.height - 1, cy + R); y++) {
        if (!this.open(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const d = Math.sqrt(d2);
        if (d < nearest) {
          nearest = d;
          nx = x;
          ny = y;
        }
        const k = 1 - d / R;
        const r = hash(x * 31 + y, e.tick);
        // spray off this surface cell, thrown away from the blast
        if ((r & 255) / 255 < (0.25 + k * 0.6) * this.mult) {
          const dir = dx === 0 ? (r & 256 ? 1 : -1) : Math.sign(dx);
          const col = this.colorAt(x, y);
          const u = ((r >>> 9) & 1023) / 1023;
          this.addDrop(
            x,
            y - 1,
            dir * (0.3 + k * 2.2 * u),
            -(0.8 + k * (2.4 + e.radius * 0.03) * (0.5 + u * 0.5)),
            50 + ((r >>> 19) & 31),
            (r >>> 24) % 4 === 0 ? FOAM : shade(col, (r >>> 26) & 1 ? 1.35 : 1),
          );
        }
      }
    }
    if (nearest < Infinity) {
      const k = 1 - nearest / R;
      this.splash(nx, ny, 0.5 + k * (1 + e.radius / 14), 0, e.tick, e.x * 13 + e.y);
    }
  }

  /** One sim tick: watch shells and tanks for splashes, move droplets, age waves. */
  tick(entities: readonly EntityView[], t: number): void {
    // shells
    for (const e of entities) {
      if (e.kind === 'projectile') {
        const p = this.shells.get(e.id);
        if (!p) {
          this.shells.set(e.id, { x: e.x, y: e.y, vx: 0, vy: 0, seen: t });
          continue;
        }
        const ddx = e.x - p.x;
        const ddy = e.y - p.y;
        if (Math.abs(ddx) < 40 && Math.abs(ddy) < 40 && (ddx !== 0 || ddy !== 0)) {
          this.shellPath(p.x, p.y, ddx, ddy, t, e.id);
        }
        p.x = e.x;
        p.y = e.y;
        p.vx = ddx;
        p.vy = ddy;
        p.seen = t;
      } else if (e.kind === 'tank') {
        this.tankStep(e.player, e.x, e.y, e.alive, t);
      }
    }
    // shells gone this tick: one that stopped dead on a pool still splashes
    for (const [id, p] of this.shells) {
      if (p.seen === t) continue;
      this.shells.delete(id);
      if (Math.abs(p.vx) > 40 || Math.abs(p.vy) > 40) continue;
      const ex = Math.round(p.x + p.vx);
      const ey = Math.round(p.y + p.vy);
      for (const [ox, oy] of [
        [0, 0],
        [0, 1],
        [0, 2],
        [-1, 1],
        [1, 1],
      ] as const) {
        if (this.isLiquid(ex + ox, ey + oy) || this.isLiquid(p.x + ox, p.y + oy)) {
          const x = this.isLiquid(ex + ox, ey + oy) ? ex + ox : Math.floor(p.x) + ox;
          const y = this.isLiquid(ex + ox, ey + oy) ? ey + oy : Math.floor(p.y) + oy;
          const sy = this.surface(x, y);
          this.splash(x, sy, 0.3 + Math.hypot(p.vx, p.vy) * 0.2, p.vx, t, id * 71);
          break;
        }
      }
    }
    this.stepDrops(t);
    this.waves = this.waves.filter(
      (w) => t - w.start < WAVE_LIFE * Math.min(1.4, 0.6 + w.amp * 0.3),
    );
  }

  /** A shell moved by (dx, dy) this tick: did it plunge into (or leap out of) a pool? */
  private shellPath(x0: number, y0: number, dx: number, dy: number, t: number, id: number): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    let was = this.isLiquid(x0, y0);
    for (let i = 1; i <= n; i++) {
      const x = Math.floor(x0 + (dx * i) / n);
      const y = Math.floor(y0 + (dy * i) / n);
      const wet = this.isLiquid(x, y);
      if (wet !== was) {
        const speed = Math.hypot(dx, dy);
        if (wet) {
          // in: splash where it went through the surface
          this.splash(x, this.surface(x, y), 0.3 + speed * 0.2, dx, t, id * 71);
        } else if (dy < 0 && this.isLiquid(x, y + 1)) {
          // out: a smaller spout behind a shell leaving the water upwards
          this.splash(x, y + 1, 0.3 + speed * 0.15, dx, t, id * 71 + 5);
        }
        return;
      }
      was = wet;
    }
  }

  /** Tanks: a splash when one drops into a pool, a wake while it drives through one. */
  private tankStep(player: number, x: number, y: number, alive: boolean, t: number): void {
    // the hull's bottom row and both tracks
    let wetX = -1;
    for (const ox of [0, -4, 4]) {
      if (this.isLiquid(x + ox, y - 1)) {
        wetX = x + ox;
        break;
      }
    }
    const wet = wetX >= 0;
    const prev = this.tanks[player];
    this.tanks[player] = { x, y, wet };
    if (!prev || !alive) return;
    const fall = y - prev.y;
    if (wet && !prev.wet && Math.abs(x - prev.x) < 20 && fall >= 0 && fall < 40) {
      // dropped (or drove) in: splash on either side of the hull
      const sy = this.surface(wetX, y - 1);
      const s = 0.6 + fall * 0.5;
      this.splash(x - 5, sy, s * 0.7, -0.5, t, player * 131);
      this.splash(x + 5, sy, s * 0.7, 0.5, t, player * 131 + 17);
    } else if (wet && x !== prev.x && t % 3 === 0) {
      // driving: a bow wave ahead and spray off the back
      const dir = Math.sign(x - prev.x);
      const sy = this.surface(wetX, y - 1);
      const r = hash(player * 17 + x, t);
      const col = this.colorAt(wetX, sy);
      for (let i = 0; i < 2; i++) {
        const u = ((r >>> (i * 8)) & 255) / 255;
        this.addDrop(
          x - dir * 6,
          sy - 1,
          -dir * (0.3 + u * 0.6),
          -(0.6 + u * 0.8),
          30,
          i ? FOAM : shade(col, 1.35),
        );
      }
      if (t % 12 === 0)
        this.addWave(
          x + dir * 5,
          this.surfaceNear(x + dir * 5, sy) < 0 ? sy : this.surfaceNear(x + dir * 5, sy),
          0.6,
          t,
        );
    }
  }

  private stepDrops(t: number): void {
    let w = 0;
    for (let i = 0; i < this.nDrops; i++) {
      const age = this.dage[i]! + 1;
      if (age >= this.dlife[i]!) continue;
      const vx = this.dvx[i]! * 0.985;
      const vy = Math.min(this.dvy[i]! + DROP_GRAVITY, 5);
      const x = this.dx[i]! + vx;
      const y = this.dy[i]! + vy;
      if (x < 0 || x >= this.width || y >= this.height) continue;
      if (y >= 0 && vy > 0) {
        const c = this.cell(Math.floor(x), Math.floor(y));
        if (c !== 0) {
          // landed: a falling drop dimples the pool it lands in
          if (this.liquid[c] === 1 && (i & 7) === 0) {
            const sx = Math.floor(x);
            const sy = this.surface(sx, Math.floor(y));
            if (this.open(sx, sy)) this.addWave(sx, sy, 0.3, t);
          }
          continue;
        }
      }
      this.dx[w] = x;
      this.dy[w] = y;
      this.dvx[w] = vx;
      this.dvy[w] = vy;
      this.dage[w] = age;
      this.dlife[w] = this.dlife[i]!;
      this.dcolor[w] = this.dcolor[i]!;
      w++;
    }
    this.nDrops = w;
  }

  /** Sound cues since the last call (for the audio engine). */
  drainCues(): EffectEvent[] {
    if (this.cues.length === 0) return NO_CUES;
    const c = this.cues;
    this.cues = [];
    return c;
  }

  draw(normal: QuadBatch, t: number): void {
    // droplets: one cell, two when falling fast (a hard streak, no blur)
    for (let i = 0; i < this.nDrops; i++) {
      const x = Math.floor(this.dx[i]!) + 0.5;
      const y = Math.floor(this.dy[i]!) + 0.5;
      const vy = this.dvy[i]!;
      const c = this.dcolor[i]!;
      if (vy > 1.6 || vy < -1.6) normal.push(x, y - Math.sign(vy) * 0.5, 1, 2, c, 1);
      else normal.push(x, y, 1, 1, c, 1);
    }
    for (const w of this.waves) this.drawWave(normal, w, t);
  }

  private drawWave(normal: QuadBatch, w: Wave, t: number): void {
    const age = t - w.start;
    if (age < 0) return;
    const life = WAVE_LIFE * Math.min(1.4, 0.6 + w.amp * 0.3);
    const fade = 1 - age / life;
    if (fade <= 0) return;
    const lit = shade(w.color, 1.4);
    const deep = shade(w.color, 0.62);
    // foam boils on the spot for a moment
    const boil = Math.round(w.amp * 2);
    if (age < 6 + w.amp * 6) {
      for (let ox = -boil; ox <= boil; ox++) {
        const x = w.x + ox;
        const sy = this.surfaceNear(x, w.y);
        if (sy < 0) continue;
        const r = hash(x, Math.floor(t / 2));
        if (r & 1) normal.push(x + 0.5, sy + 0.5, 1, 1, FOAM, 1);
        if (w.amp > 1.2 && ((r >>> 1) & 3) === 0) normal.push(x + 0.5, sy - 0.5, 1, 1, FOAM, 1);
      }
    }
    const rings = w.amp >= 1.6 ? 3 : w.amp >= 0.8 ? 2 : 1;
    for (let j = 0; j < rings; j++) {
      const d = age * WAVE_SPEED - j * RING_GAP;
      if (d < 1) continue;
      for (let side = -1; side <= 1; side += 2) {
        const ext = side < 0 ? w.left : w.right;
        const { pos, hits } = bounce(d, ext);
        if (hits > 3) continue;
        // height in hard steps: rings behind are lower, each bank bounce halves it
        const h = w.amp * fade * (1 - j * 0.3) * (hits === 0 ? 1 : 0.5 / hits);
        if (h < 0.15) continue;
        const x = Math.round(w.x + side * pos);
        const sy = this.surfaceNear(x, w.y);
        if (sy < 0) continue;
        const run = side * (hits & 1 ? -1 : 1); // which way this front is moving
        // crest: a raised cell when it's tall, a bright cell on the surface always
        if (h >= 0.45) normal.push(x + 0.5, sy - 0.5, 1, 1, h >= 1.4 ? FOAM : lit, 1);
        if (h >= 1.2 && this.cell(x - run, sy - 1) === 0) {
          normal.push(x - run + 0.5, sy - 0.5, 1, 1, w.color, 1);
        }
        if (h >= 2.2 && this.cell(x, sy - 2) === 0) normal.push(x + 0.5, sy - 1.5, 1, 1, lit, 1);
        if (h >= 2.2 && this.cell(x - run, sy - 1) === 0) {
          normal.push(x - run + 0.5, sy - 0.5, 1, 1, lit, 1);
        }
        normal.push(x + 0.5, sy + 0.5, 1, 1, h >= 0.5 ? lit : shade(w.color, 1.2), 1);
        // the shoulder ahead catches a little light; the trough behind sinks dark
        if (h >= 0.5 && this.surfaceNear(x + run, sy) === sy) {
          normal.push(x + run + 0.5, sy + 0.5, 1, 1, shade(w.color, 1.2), 1);
        }
        // the trough behind sinks: dark cells where the surface dipped
        for (let k = 2; k <= (h >= 1.2 ? 3 : 2); k++) {
          const bx = x - run * k;
          if (this.surfaceNear(bx, sy) === sy) normal.push(bx + 0.5, sy + 0.5, 1, 1, deep, 1);
        }
      }
    }
  }

  clear(): void {
    this.nDrops = 0;
    this.waves = [];
    this.shells.clear();
    this.tanks = [];
    this.cues = [];
  }
}

const NO_CUES: EffectEvent[] = [];

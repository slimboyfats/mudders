import type { EffectEvent } from '@mudders/shared';
import type { Quality } from '../types';
import { Shape, type QuadBatch } from './batch';
import { FxRng } from './gl';
import { drawMushroom, makeMushroom, type Mushroom } from './mushroom';
import { PKind, type Particles } from './particles';
import { shade } from './theme';

/** Hard shade bands for cosmetic dirt clods. */
const DIRT_BANDS = [0.62, 0.8, 1, 1.18, 1.32] as const;

/**
 * Pixel-renderer implementations of renderer-agnostic effect events (§2b, §2c.3 `effect.*`).
 * Each event type maps to a handler; unknown types are ignored. Everything is seeded from the
 * event itself, so the same snapshot stream always produces the same frames.
 */

export interface Ripple {
  x: number;
  y: number;
  start: number;
  dur: number;
  maxR: number;
  width: number;
  strength: number;
}

interface Glow {
  x: number;
  y: number;
  r: number;
  start: number;
  dur: number;
  color: number;
  strength: number;
}

interface Front {
  x: number;
  y: number;
  maxR: number;
  start: number;
  dur: number;
  rng: FxRng;
}

interface Bolt {
  /** Cells of the jagged path, x0,y0,x1,y1,… (main channel then branches). */
  cells: Int32Array;
  /** Where the main channel ends in `cells` (branches after are drawn dimmer). */
  main: number;
  start: number;
  dur: number;
}

/**
 * Flash and sky colours per damage type (index into DAMAGE_TYPES: blast, kinetic, heat, cold,
 * shock, dig, corrosive): [glow colour, sky tint r, g, b].
 */
const DT_LOOK: readonly (readonly [number, number, number, number])[] = [
  [0xffc070, 0.5, 0.32, 0.18],
  [0xffe0b0, 0.42, 0.36, 0.28],
  [0xff8a30, 0.62, 0.24, 0.06],
  [0xa8dcff, 0.2, 0.36, 0.62],
  [0xc8d8ff, 0.42, 0.46, 0.72],
  [0xd0b080, 0.34, 0.27, 0.16],
  [0xb8f040, 0.22, 0.5, 0.1],
];

export const QUALITY_PARTICLES: Record<Quality, { cap: number; mult: number }> = {
  low: { cap: 800, mult: 0.35 },
  medium: { cap: 2500, mult: 0.7 },
  high: { cap: 6000, mult: 1 },
};

/** Reads terrain for effects (e.g. chunk colour); renderer-provided. */
export interface TerrainProbe {
  material(x: number, y: number): number;
  color(material: number): number;
  width: number;
  height: number;
}

export class EffectSystem {
  ripples: Ripple[] = [];
  private glows: Glow[] = [];
  private fronts: Front[] = [];
  private bolts: Bolt[] = [];
  private mushrooms: Mushroom[] = [];
  private shakeAmp = 0;
  private shakeStart = 0;
  /** Sky tint, additive RGB, decaying every tick. `skyFlash` is its strength. */
  readonly sky: [number, number, number] = [0, 0, 0];
  skyFlash = 0;
  /** Chromatic split in cells (nukes), decaying. */
  split = 0;
  mult = 1;

  constructor(
    private readonly particles: Particles,
    private readonly probe: TerrainProbe,
  ) {}

  private rngFor(e: EffectEvent, salt: number): FxRng {
    return new FxRng(
      (Math.imul(e.tick + 1, 2654435761) ^ Math.imul(e.x + 7, 40503) ^ Math.imul(e.y + 3, 9973)) +
        salt,
    );
  }

  /** Spawn the visual for one effect event. */
  handle(e: EffectEvent): void {
    switch (e.type) {
      case 'burst':
        this.burst(e, e.params.count ?? 24);
        break;
      case 'flash': {
        const look = DT_LOOK[e.params.dt ?? 0] ?? DT_LOOK[0]!;
        const strength = e.params.strength ?? 1;
        this.glows.push({
          x: e.x,
          y: e.y,
          r: e.radius * 2.2,
          start: e.tick,
          dur: 14,
          color: look[0],
          strength,
        });
        this.tintSky(look, 0.008 * e.radius * strength);
        // the biggest blasts (nukes) bloom white and split the picture's colours
        if (e.radius >= 60) {
          this.glows.push({
            x: e.x,
            y: e.y,
            r: e.radius * 1.2,
            start: e.tick,
            dur: 26,
            color: 0xfff6e0,
            strength: 1.4,
          });
          this.split = Math.max(this.split, Math.min(4, e.radius / 30));
        }
        break;
      }
      case 'nukeBlast':
        this.nuke(e);
        break;
      case 'dirtBurst':
        this.dirtBurst(e);
        break;
      case 'shake':
        this.shakeAmp = Math.max(this.shakeAmp, (e.params.strength ?? 1) * 3);
        this.shakeStart = e.tick;
        break;
      case 'ripple':
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 45,
          maxR: e.radius * 2,
          width: 16,
          strength: e.params.strength ?? 1,
        });
        break;
      case 'shockwave':
        this.fronts.push({
          x: e.x,
          y: e.y,
          maxR: e.radius,
          start: e.tick,
          dur: Math.max(4, e.params.ticks ?? 20),
          rng: this.rngFor(e, 11),
        });
        break;
      case 'muzzle': {
        const rng = this.rngFor(e, 3);
        const a = ((e.params.angle ?? 90) * Math.PI) / 180;
        const n = Math.round(10 * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const s = rng.range(0.6, 2.2);
          const da = rng.range(-0.35, 0.35);
          this.particles.add({
            x: e.x,
            y: e.y,
            vx: Math.cos(a + da) * s,
            vy: -Math.sin(a + da) * s,
            life: rng.range(6, 14),
            size: rng.range(0.5, 1),
            color: 0xffb040,
            kind: PKind.Spark,
          });
        }
        for (let i = 0; i < 3; i++) {
          this.particles.add({
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * 0.4 + rng.range(-0.1, 0.1),
            vy: -Math.sin(a) * 0.4,
            life: rng.range(25, 40),
            size: rng.range(2, 3.5),
            color: 0x8a8090,
            kind: PKind.Smoke,
          });
        }
        this.glows.push({
          x: e.x,
          y: e.y,
          r: 6,
          start: e.tick,
          dur: 5,
          color: 0xffd080,
          strength: 1,
        });
        break;
      }
      case 'land': {
        const rng = this.rngFor(e, 5);
        const n = Math.round(Math.min(20, 4 + (e.params.distance ?? 0)) * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          this.particles.add({
            x: e.x + side * rng.range(4, 9),
            y: e.y - 1,
            vx: side * rng.range(0.2, 0.9),
            vy: -rng.range(0, 0.25),
            life: rng.range(20, 40),
            size: rng.range(2, 4),
            color: this.dustColor(e.x, e.y),
            kind: PKind.Dust,
          });
        }
        break;
      }
      case 'creak':
      case 'collapse': {
        // dust off a cracking or collapsing prop: pixel dust puffs across its footprint
        const rng = this.rngFor(e, 9);
        const big = e.type === 'collapse';
        const n = Math.round((big ? 36 : 10) * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const x = e.x + rng.range(-e.radius, e.radius);
          const y = e.y + rng.range(-e.radius, e.radius) * 0.6;
          this.particles.add({
            x,
            y,
            vx: rng.range(-0.35, 0.35),
            vy: -rng.range(0.05, big ? 0.5 : 0.25),
            life: rng.range(25, big ? 70 : 40),
            size: rng.range(2, big ? 5 : 3),
            color: this.dustColor(Math.round(x), Math.round(y)),
            kind: PKind.Dust,
          });
        }
        if (big) {
          this.shakeAmp = Math.max(this.shakeAmp, 3);
          this.shakeStart = e.tick;
        }
        break;
      }
      case 'bolt':
        this.bolt(e);
        break;
      case 'quake': {
        // ground shudder: shake plus dust kicked up along the surface around the epicentre
        const strength = e.params.strength ?? 1;
        this.shakeAmp = Math.max(this.shakeAmp, strength * 2.5);
        this.shakeStart = e.tick;
        const rng = this.rngFor(e, 13);
        const n = Math.round(Math.min(40, e.radius / 4 + 6) * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const x = Math.round(e.x + rng.range(-e.radius, e.radius) * 0.5);
          const y = this.surfaceNear(x, e.y, 40);
          if (y < 0) continue;
          this.particles.add({
            x,
            y: y - 1,
            vx: rng.range(-0.3, 0.3),
            vy: -rng.range(0.1, 0.6),
            life: rng.range(25, 50),
            size: rng.range(2, 4),
            color: this.dustColor(x, y + 1),
            kind: PKind.Dust,
          });
        }
        break;
      }
      case 'resonate':
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 36,
          maxR: e.radius * 1.4,
          width: 10,
          strength: 0.8,
        });
        this.glows.push({
          x: e.x,
          y: e.y,
          r: e.radius,
          start: e.tick,
          dur: 18,
          color: 0xb070ff,
          strength: 1,
        });
        this.tintSky([0, 0.36, 0.18, 0.6], 0.25);
        break;
      case 'zone':
        this.puff(e, ZONE_COLOR[e.params.look ?? 0] ?? 0x9ab83a, 30);
        break;
      case 'zoneHurt':
        this.puff(e, 0xb8f040, 8);
        break;
      case 'burn': {
        const rng = this.rngFor(e, 17);
        const n = Math.round(14 * this.mult) + 3;
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: e.x + rng.range(-e.radius, e.radius),
            y: e.y + rng.range(0, 3),
            vx: rng.range(-0.2, 0.2),
            vy: -rng.range(0.4, 1.1),
            life: rng.range(10, 24),
            size: 1,
            color: rng.next() < 0.4 ? 0xffe070 : 0xff6a1a,
            kind: PKind.Spark,
          });
        }
        break;
      }
      case 'implode': {
        // grit sucked inward toward the centre
        const rng = this.rngFor(e, 19);
        const n = Math.round(40 * this.mult) + 4;
        const life = Math.max(8, e.params.ticks ?? 20);
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, Math.PI * 2);
          const r = e.radius * rng.range(0.7, 1.1);
          this.particles.add({
            x: e.x + Math.cos(a) * r,
            y: e.y + Math.sin(a) * r,
            vx: (-Math.cos(a) * r) / life,
            vy: (-Math.sin(a) * r) / life,
            life,
            size: 1,
            color: rng.next() < 0.5 ? 0xd0b0ff : 0x8060c0,
            kind: PKind.Spark,
          });
        }
        this.tintSky([0, 0.2, 0.1, 0.4], 0.2);
        break;
      }
      case 'tankDeath':
        this.burst(e, 70);
        this.glows.push({
          x: e.x,
          y: e.y,
          r: 40,
          start: e.tick,
          dur: 20,
          color: 0xff9040,
          strength: 1.2,
        });
        this.tintSky(DT_LOOK[2]!, 0.5);
        this.shakeAmp = Math.max(this.shakeAmp, 7);
        this.shakeStart = e.tick;
        break;
      default:
        break; // unknown effect: ignored by contract
    }
  }

  /**
   * A nuke's main blast: the mushroom cloud, a map-wide distortion shockwave (the approved moving-pixel lens band,
   * scaled up, no light ring), a ground dust front, and debris and sparks thrown out from the
   * centre in every direction.
   */
  private nuke(e: EffectEvent): void {
    const r = e.radius;
    const k = e.params.strength ?? 1;
    // the mushroom cloud starts with the bang, together with the shockwave
    this.mushrooms.push(makeMushroom(e.x, e.y, r, e.tick, this.rngFor(e, 31).next() * 4294967296));
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 70,
      maxR: r * 7,
      width: 26,
      strength: 1.5 * k,
    });
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick + 6,
      dur: 60,
      maxR: r * 4.5,
      width: 12,
      strength: 0.9 * k,
    });
    this.fronts.push({
      x: e.x,
      y: e.y,
      maxR: r * 4,
      start: e.tick,
      dur: 46,
      rng: this.rngFor(e, 37),
    });
    this.shakeAmp = Math.max(this.shakeAmp, 4 + r / 12);
    this.shakeStart = e.tick;
    const rng = this.rngFor(e, 41);
    const base = this.dustColor(e.x, e.y + r * 0.5);
    const n = Math.round((120 + r * 2) * this.mult);
    const fast = 3 + r / 20;
    for (let i = 0; i < n; i++) {
      // a full circle, biased upward: whatever is below is ground and stops it anyway
      const a = rng.range(-0.15, 1.15) * Math.PI;
      const s = rng.range(0.35, 1) * fast;
      const spark = i % 2 === 0;
      this.particles.add({
        x: e.x + Math.cos(a) * r * 0.3,
        y: e.y - Math.sin(a) * r * 0.3,
        vx: Math.cos(a) * s,
        vy: -Math.sin(a) * s,
        life: rng.range(50, 100),
        size: spark ? 1 : rng.range(1.5, 2.5),
        color: spark ? (rng.next() < 0.4 ? 0xfff0a0 : 0xff7a1a) : shade(base, rng.range(0.7, 1.2)),
        kind: spark ? PKind.Spark : PKind.Chunk,
      });
    }
  }

  /** Mushroom clouds, drawn over particles; finished ones are dropped. */
  drawMushrooms(normal: QuadBatch, additive: QuadBatch, t: number): void {
    if (this.mushrooms.length === 0) return;
    this.mushrooms = this.mushrooms.filter((m) => drawMushroom(m, normal, additive, t));
  }

  /** Add a coloured sky tint (§2a sky reaction); `amount` ~0.5 is a big flash. */
  tintSky(look: readonly [number, number, number, number], amount: number): void {
    const k = Math.min(0.5, amount);
    const s = this.sky;
    s[0] = Math.min(0.5, s[0] + look[1] * k);
    s[1] = Math.min(0.5, s[1] + look[2] * k);
    s[2] = Math.min(0.5, s[2] + look[3] * k);
    this.skyFlash = Math.max(s[0], s[1], s[2]);
  }

  /** A soft cloud of pixel puffs (zone spawns, zone damage). */
  private puff(e: EffectEvent, color: number, count: number): void {
    const rng = this.rngFor(e, 23);
    const n = Math.round(count * this.mult) + 2;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: e.x + rng.range(-e.radius, e.radius) * 0.7,
        y: e.y + rng.range(-e.radius, e.radius) * 0.5,
        vx: rng.range(-0.25, 0.25),
        vy: -rng.range(0, 0.25),
        life: rng.range(30, 60),
        size: rng.range(3, 6),
        color: shade(color, rng.range(0.8, 1.1)),
        kind: PKind.Dust,
      });
    }
  }

  /** A jagged lightning channel from the top of the map down to (x, y), with a branch or two. */
  private bolt(e: EffectEvent): void {
    const rng = this.rngFor(e, 29);
    const pts: number[] = [];
    const walk = (x0: number, y0: number, y1: number, drift: number) => {
      let x = x0;
      let y = y0;
      while (y < y1) {
        const seg = Math.min(y1 - y, Math.round(rng.range(3, 9)));
        const nx = x + Math.round(rng.range(-3, 3) + drift);
        line(x, y, nx, y + seg, pts);
        x = nx;
        y += seg;
      }
      return x;
    };
    // aim the main channel so it lands on the target column
    walk(e.x + Math.round(rng.range(-18, 18)), 0, e.y, 0);
    const fixX = e.x - pts[pts.length - 2]!;
    for (let i = 0; i < pts.length; i += 2) {
      const k = pts[i + 1]! / Math.max(1, e.y);
      pts[i] = pts[i]! + Math.round(fixX * k);
    }
    const main = pts.length;
    const branches = 1 + Math.floor(rng.next() * 2);
    for (let b = 0; b < branches; b++) {
      const at = 2 * Math.floor(rng.range(0.2, 0.7) * (main / 2));
      const bx = pts[at]!;
      const by = pts[at + 1]!;
      walk(bx, by, by + Math.round(rng.range(12, 30)), rng.next() < 0.5 ? -1.5 : 1.5);
    }
    this.bolts.push({ cells: Int32Array.from(pts), main, start: e.tick, dur: 12 });
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 18,
      start: e.tick,
      dur: 10,
      color: 0xc8d8ff,
      strength: 1.2,
    });
    this.tintSky(DT_LOOK[4]!, 0.6);
  }

  /** Average colour of solid terrain around (x, y), for dirt chunks and dust. */
  private dustColor(x: number, y: number): number {
    const p = this.probe;
    for (let r = 0; r < 12; r += 2) {
      for (const [dx, dy] of [
        [0, r],
        [r, 0],
        [-r, 0],
        [0, -r],
        [r, r],
        [-r, r],
      ] as const) {
        const m = p.material(Math.round(x + dx), Math.round(y + dy));
        if (m !== 0) return p.color(m);
      }
    }
    return 0x7a5a3a;
  }

  /**
   * Dirt Bomb: cosmetic clods in hard shade bands that fly the same fans as the sim's dirt (and
   * fade before they land, so only sim debris makes ground), a dust surge rolling out along the
   * ground both ways, and a dirty dust pall over the crater.
   */
  private dirtBurst(e: EffectEvent): void {
    const rng = this.rngFor(e, 13);
    const base = this.dustColor(e.x, e.y + 4);
    const lo = ((e.params.low ?? 20) * Math.PI) / 180;
    const hi = ((e.params.high ?? 70) * Math.PI) / 180;
    const vMax = e.params.speed ?? 4;
    const lift = e.params.lift ?? 0;
    const nClod = Math.round(160 * this.mult) + 8;
    for (let i = 0; i < nClod; i++) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const a = rng.range(lo, hi);
      const s = rng.range(0.45, 1) * vMax;
      this.particles.add({
        x: e.x + side * rng.range(0, 6),
        y: e.y - lift + rng.range(-3, 3),
        vx: side * Math.cos(a) * s,
        vy: -Math.sin(a) * s,
        life: rng.range(30, 70),
        size: rng.next() < 0.25 ? 3 : 2,
        color: shade(base, DIRT_BANDS[Math.floor(rng.next() * DIRT_BANDS.length)]!),
        kind: PKind.Chunk,
      });
    }
    const nSurge = Math.round(48 * this.mult) + 4;
    for (let i = 0; i < nSurge; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.particles.add({
        x: e.x + side * rng.range(2, 10),
        y: e.y - rng.range(0, 4),
        vx: side * rng.range(1, 3.2),
        vy: -rng.range(0, 0.3),
        life: rng.range(40, 80),
        size: rng.range(3, 6),
        color: shade(base, rng.next() < 0.5 ? 0.85 : 1.05),
        kind: PKind.Dust,
      });
    }
    const nPall = Math.round(14 * Math.max(0.5, this.mult));
    for (let i = 0; i < nPall; i++) {
      this.particles.add({
        x: e.x + rng.range(-12, 12),
        y: e.y - rng.range(0, 14),
        vx: rng.range(-0.3, 0.3),
        vy: -rng.range(0.1, 0.5),
        life: rng.range(70, 120),
        size: rng.range(5, 9),
        color: shade(base, 0.7),
        kind: PKind.Smoke,
      });
    }
    this.shakeAmp = Math.max(this.shakeAmp, 5);
    this.shakeStart = e.tick;
  }

  private burst(e: EffectEvent, count: number): void {
    const rng = this.rngFor(e, 1);
    const r = Math.max(4, e.radius);
    const nSpark = Math.round(count * 1.4 * this.mult);
    const speed = 0.8 + r / 14;
    for (let i = 0; i < nSpark; i++) {
      const a = rng.range(Math.PI * 0.05, Math.PI * 0.95);
      const s = rng.range(0.3, 1) * speed;
      this.particles.add({
        x: e.x + rng.range(-2, 2),
        y: e.y + rng.range(-2, 2),
        vx: Math.cos(a) * s * 1.2,
        vy: -Math.sin(a) * s,
        life: rng.range(14, 36),
        size: rng.range(0.5, 1.1),
        color: rng.next() < 0.3 ? 0xfff0a0 : 0xff7a1a,
        kind: PKind.Spark,
      });
    }
    // chunks of whatever the blast was in, thrown from the crater rim
    const base = this.dustColor(e.x, e.y + r * 0.5);
    const nChunk = Math.round(count * this.mult);
    for (let i = 0; i < nChunk; i++) {
      const a = rng.range(Math.PI * 0.1, Math.PI * 0.9);
      const s = rng.range(0.4, 1) * speed * 1.1;
      this.particles.add({
        x: e.x + Math.cos(a) * r * 0.6,
        y: e.y - Math.sin(a) * r * 0.4,
        vx: Math.cos(a) * s,
        vy: -Math.sin(a) * s,
        life: rng.range(30, 60),
        size: 1,
        color: shade(base, rng.range(0.75, 1.15)),
        kind: PKind.Chunk,
      });
    }
    const nSmoke = Math.round((3 + r / 5) * Math.max(0.5, this.mult));
    for (let i = 0; i < nSmoke; i++) {
      this.particles.add({
        x: e.x + rng.range(-r, r) * 0.5,
        y: e.y + rng.range(-r, r) * 0.3,
        vx: rng.range(-0.25, 0.25),
        vy: -rng.range(0.05, 0.4),
        life: rng.range(50, 90),
        size: rng.range(r * 0.25, r * 0.5),
        color: rng.next() < 0.5 ? 0x4a4048 : 0x6a5e62,
        kind: PKind.Smoke,
      });
    }
  }

  /** Advance continuing effects by one tick (called once per sim tick, in tick order). */
  tick(t: number): void {
    // shockwave fronts: dust and grit kicked up along the ground as the ring passes
    this.fronts = this.fronts.filter((f) => {
      const k = (t - f.start) / f.dur;
      if (k > 1) return false;
      const r = f.maxR * k;
      for (const side of [-1, 1]) {
        const x = Math.round(f.x + side * r);
        const y = this.surfaceNear(x, f.y, f.maxR);
        if (y < 0) continue;
        const n = Math.max(1, Math.round(3 * this.mult));
        const col = this.dustColor(x, y + 1);
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: x + f.rng.range(-1.5, 1.5),
            y: y - f.rng.range(0, 2),
            vx: side * f.rng.range(0.3, 1.2),
            vy: -f.rng.range(0.1, 0.7),
            life: f.rng.range(24, 48),
            size: f.rng.range(2.5, 5),
            color: shade(col, 1.15),
            kind: PKind.Dust,
          });
        }
        if (f.rng.next() < 0.6 * this.mult) {
          this.particles.add({
            x,
            y: y - 1,
            vx: side * f.rng.range(0.4, 1.4),
            vy: -f.rng.range(0.8, 2),
            life: 40,
            size: 1,
            color: col,
            kind: PKind.Chunk,
          });
        }
      }
      return true;
    });
    this.ripples = this.ripples.filter((r) => t - r.start <= r.dur);
    this.glows = this.glows.filter((g) => t - g.start <= g.dur);
    this.bolts = this.bolts.filter((b) => t - b.start <= b.dur);
    const s = this.sky;
    s[0] *= 0.86;
    s[1] *= 0.86;
    s[2] *= 0.86;
    this.skyFlash = Math.max(s[0], s[1], s[2]);
    if (this.skyFlash < 0.002) {
      this.skyFlash = 0;
      s[0] = s[1] = s[2] = 0;
    }
    this.split = this.split > 0.3 ? this.split * 0.9 : 0;
  }

  /** Top surface row near (x, y): first solid cell with air above, scanning ±range. */
  private surfaceNear(x: number, y: number, range: number): number {
    const p = this.probe;
    if (x < 0 || x >= p.width) return -1;
    const y0 = Math.max(1, Math.round(y - range));
    const y1 = Math.min(p.height - 1, Math.round(y + range));
    for (let yy = y0; yy <= y1; yy++) {
      if (p.material(x, yy) !== 0 && p.material(x, yy - 1) === 0) return yy;
    }
    return -1;
  }

  /** Screen shake offset in cells at render time `t`. */
  shake(t: number): [number, number] {
    const age = t - this.shakeStart;
    if (this.shakeAmp <= 0 || age > 18 || age < 0) return [0, 0];
    const a = this.shakeAmp * (1 - age / 18) ** 2;
    return [Math.sin(age * 2.1) * a, Math.cos(age * 2.9) * a * 0.6];
  }

  drawGlows(additive: QuadBatch, t: number): void {
    for (const g of this.glows) {
      const k = Math.max(0, (t - g.start) / g.dur);
      if (k > 1) continue;
      const a = (1 - k) * (1 - k) * g.strength;
      // hard-banded, cell-snapped blobs instead of smooth gradients (pixel look, §2a)
      const r = g.r * (0.55 + 0.45 * k);
      additive.push(g.x, g.y, r * 2, r * 2, g.color, 0.75 * a, Shape.Pixel);
      additive.push(g.x, g.y, r * 0.8, r * 0.8, 0xfff6e0, 0.9 * a, Shape.Pixel);
    }
  }

  /** Lightning channels: a white core with a cold halo, flickering out in whole steps. */
  drawBolts(additive: QuadBatch, t: number): void {
    for (const b of this.bolts) {
      const age = t - b.start;
      if (age < 0 || age > b.dur) continue;
      // on, off, on, then fading: the classic double strike
      const on = age < 3 || (age >= 4 && age < 6) || age >= 7;
      if (!on) continue;
      const fade = age < 7 ? 1 : 1 - (age - 7) / (b.dur - 7);
      const c = b.cells;
      for (let i = 0; i < c.length; i += 2) {
        const branch = i >= b.main;
        const x = c[i]! + 0.5;
        const y = c[i + 1]! + 0.5;
        additive.push(x, y, 3, 1, 0x4060c0, 0.5 * fade * (branch ? 0.6 : 1));
        additive.push(x, y, 1, 1, branch ? 0xb0c8ff : 0xffffff, fade * (branch ? 0.7 : 1));
      }
    }
  }

  /** Low quality has no distortion pass: draw ripples as plain rings instead. */
  drawRippleRings(additive: QuadBatch, t: number): void {
    for (const r of this.ripples) {
      const k = (t - r.start) / r.dur;
      if (k < 0 || k > 1) continue;
      const rad = r.maxR * Math.sqrt(k);
      additive.push(
        r.x,
        r.y,
        rad * 2.35,
        rad * 2.35,
        0xb0d0ff,
        0.35 * (1 - k) * r.strength,
        Shape.Ring,
      );
      // (low quality only; medium/high get the cell-snapped refraction pass)
    }
  }

  clear(): void {
    this.ripples = [];
    this.glows = [];
    this.fronts = [];
    this.bolts = [];
    this.mushrooms = [];
    this.shakeAmp = 0;
    this.skyFlash = 0;
    this.sky[0] = this.sky[1] = this.sky[2] = 0;
    this.split = 0;
  }
}

/** Zone looks by index (gas, acid, resonance), matching the sim's zone `look` order. */
export const ZONE_COLOR = [0x9ab83a, 0xb8f040, 0xb070ff] as const;

/** Append the cells of a grid line (Bresenham) from (x0,y0) to (x1,y1), excluding the start. */
function line(x0: number, y0: number, x1: number, y1: number, out: number[]): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    out.push(x, y);
  }
}

import { PKind, type ParticleSink } from './particles';

/**
 * Steam (renderer only): fire meeting water. A blast that goes off in or beside a pool boils the
 * water it reaches into a white column of steam that rolls up off the surface and thins out, and a
 * burning shell (napalm flask, meteor, fire globs) that plunges into water hisses out in a gout of
 * steam where it went in. Steam is drawn as plume motes (pale, never ember-lit like smoke), so it
 * stays apart from the soot in the smoke fluid and steps lighter as it rises.
 *
 * Seeded from the event, so captures replay byte-identically. Never feeds back into the sim.
 */

export interface SteamWater {
  /** Whether a cell holds a cold liquid (water, oil, liquid dirt). */
  liquid(x: number, y: number): boolean;
}

/** Young steam, a little blue-grey: plumes step lighter to near white as they rise. */
const STEAM = 0xc4d0d8;
const STEAM_DIM = 0xaebac2;
/** Ticks after the bang before the water starts to steam (the fireball has cleared by then). */
const BOIL_DELAY = 8;
/** Most boils at once. */
const MAX_BOILS = 8;

interface Boil {
  x: number;
  reach: number;
  radius: number;
  start: number;
  dur: number;
  seed: number;
  vents: { x: number; y: number; d: number }[];
}

/** Most surface cells a blast boils off (keeps a nuke over a lake bounded). */
const MAX_VENTS = 40;

function hash(a: number, b: number): number {
  let x = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return (x ^ (x >>> 15)) >>> 0;
}

/**
 * Water surface cells (liquid with no liquid above) within `reach` of (x, y), every `step`
 * columns, nearest the blast first and at most `max`.
 */
export function wetSurface(
  w: SteamWater,
  x: number,
  y: number,
  reach: number,
  step: number,
  max: number,
): { x: number; y: number; d: number }[] {
  const out: { x: number; y: number; d: number }[] = [];
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dx = -reach; dx <= reach; dx += step) {
    const px = cx + dx;
    for (let dy = -reach; dy <= reach; dy++) {
      const py = cy + dy;
      if (!w.liquid(px, py) || w.liquid(px, py - 1)) continue;
      const d = Math.hypot(dx, dy);
      if (d <= reach) out.push({ x: px, y: py, d });
      break;
    }
  }
  out.sort((a, b) => a.d - b.d || a.x - b.x);
  if (out.length > max) out.length = max;
  return out;
}

export class SteamFx {
  private boils: Boil[] = [];
  /** Last tick each shell hissed, by projectile id (one gout per plunge). */
  private hissed = new Map<number, number>();

  /**
   * A blast of `radius` at (x, y): find the water it reaches and boil it off over the next second
   * or so (fed in {@link tick}), after the fireball has cleared. Returns the vents it found.
   */
  blast(
    x: number,
    y: number,
    radius: number,
    strength: number,
    tick: number,
    w: SteamWater,
  ): number {
    if (strength <= 0 || radius < 3) return 0;
    const reach = Math.round(radius * 1.3 + 3);
    const step = radius > 30 ? 3 : 2;
    const vents = wetSurface(w, x, y, reach, step, MAX_VENTS);
    if (vents.length === 0) return 0;
    if (this.boils.length >= MAX_BOILS) this.boils.shift();
    this.boils.push({
      x,
      reach,
      radius,
      start: tick,
      dur: Math.round(40 + radius * 1.5),
      seed: hash(tick, Math.round(x) * 13 + Math.round(y)),
      vents,
    });
    return vents.length;
  }

  /** One sim tick: the boiling water near recent blasts keeps venting steam, dying down. */
  tick(t: number, w: SteamWater, sink: ParticleSink, mult: number): void {
    if (this.boils.length === 0) return;
    const k = Math.max(0.35, mult);
    for (const b of this.boils) {
      const age = t - b.start - BOIL_DELAY;
      if (age < 0 || age >= b.dur) continue;
      const fade = 1 - age / b.dur;
      const big = 0.6 + b.radius / 40;
      for (let i = 0; i < b.vents.length; i++) {
        const v = b.vents[i]!;
        const near = 1 - v.d / (b.reach + 1);
        const r = hash(b.seed + age, i);
        // each vent puffs now and then, more often near the blast and early on
        if ((r & 255) / 255 > (0.3 + 0.7 * near) * fade * k) continue;
        // the water may have been thrown out: the vent follows the surface down, or stops
        let vy = v.y;
        for (let j = 0; j < 12 && !w.liquid(v.x, vy); j++) vy++;
        if (!w.liquid(v.x, vy)) continue;
        while (vy > 0 && w.liquid(v.x, vy - 1)) vy--;
        const out = Math.sign(v.x - b.x) || ((r >>> 9) & 1 ? 1 : -1);
        sink.add({
          x: v.x + 0.5 + (((r >>> 4) & 7) - 3.5) * 0.4,
          y: vy - 1,
          vx: out * near * (0.1 + ((r >>> 10) & 255) / 1200) * big,
          vy: -(0.2 + near * 0.5 * fade + ((r >>> 18) & 127) / 600) * big,
          life: 60 + ((r >>> 24) & 63) + Math.round(b.radius),
          size: 2.5 + (near * 2.5 * big + ((r >>> 12) & 3) * 0.5) * (0.5 + fade * 0.5),
          color: r >>> 30 === 0 ? STEAM_DIM : STEAM,
          kind: PKind.Plume,
        });
      }
    }
  }

  /**
   * A burning shell at (x, y) this tick: if it just went into water, a hissing gout of steam
   * shoots up where it went in.
   */
  shell(id: number, x: number, y: number, tick: number, w: SteamWater, sink: ParticleSink): void {
    if (!w.liquid(Math.floor(x), Math.floor(y))) return;
    const last = this.hissed.get(id);
    this.hissed.set(id, tick);
    if (last !== undefined && tick - last < 20) return;
    // find the surface it went in through
    let sy = Math.floor(y);
    for (let i = 0; i < 24 && w.liquid(Math.floor(x), sy - 1); i++) sy--;
    for (let p = 0; p < 7; p++) {
      const r = hash(tick * 31 + id, p);
      sink.add({
        x: x + (((r >>> 4) & 7) - 3.5) * 0.5,
        y: sy - 0.5,
        vx: (((r >>> 8) & 255) / 255 - 0.5) * 0.5,
        vy: -(0.6 + ((r >>> 16) & 255) / 300),
        life: 45 + ((r >>> 24) & 31),
        size: 3 + ((r >>> 12) & 3) * 0.6,
        color: p % 3 === 0 ? STEAM_DIM : STEAM,
        kind: PKind.Plume,
      });
    }
  }

  /** Forget shells that are gone. */
  prune(tick: number): void {
    if (this.boils.length > 0)
      this.boils = this.boils.filter((b) => tick - b.start < b.dur + BOIL_DELAY);
    if (this.hissed.size === 0) return;
    for (const [id, t] of this.hissed) if (tick - t > 120) this.hissed.delete(id);
  }

  clear(): void {
    this.boils = [];
    this.hissed.clear();
  }
}

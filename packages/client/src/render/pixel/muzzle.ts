import type { QuadBatch } from './batch';
import type { FluidSink } from './fluid';
import { PKind, type ParticleSink } from './particles';

/**
 * The firing kick (renderer only): what a tank's shot does at its own end. A tongue of fire leaps
 * out of the barrel, hot white at its core with yellow and orange bands at the edges, and breaks
 * up over a few ticks; bigger guns vent short jets out of the muzzle brake to either side. The
 * barrel slams back into the turret and eases out again, the heaviest guns rock the whole hull a
 * cell, and the blast blows dust off the ground under the muzzle, outward from it, more the lower
 * the barrel points.
 *
 * Everything scales with the weapon's heft (`RenderPalette.muzzles`, 0.1 for a pea shooter to 1
 * for a nuke), is seeded from the tick and the tank, and snaps to map cells: hard colour bands,
 * no glow. It reads the `muzzle` events the sim already sends and never feeds back into it.
 */

interface Shot {
  /** Barrel tip, cells. */
  x: number;
  y: number;
  /** Aim in radians (0 = right, up positive). */
  a: number;
  heft: number;
  start: number;
  player: number;
  seed: number;
}

/** A tank as the kick needs it: where it stands and whose it is. */
export interface KickTank {
  player: number;
  x: number;
  y: number;
  alive: boolean;
}

export interface KickGround {
  solid(x: number, y: number): boolean;
  /** Colour of the ground near a cell, for the dust. */
  dust(x: number, y: number): number;
}

/** Flash colours, hottest first. */
const CORE = 0xfffbe8;
const HOT = 0xffd448;
const EDGE = 0xff8a28;
const EMBER = 0xc84a18;
/** Longest a kick is remembered (the slowest barrel return), ticks. */
const KEEP = 30;

function hash(a: number, b: number): number {
  let x = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return (x ^ (x >>> 15)) >>> 0;
}

/** Ticks the flash of a shot of this heft burns. */
export function flashTicks(heft: number): number {
  return 2 + Math.round(3 * heft);
}

/** Cells the barrel is pulled back `age` ticks after a shot of this heft. */
export function recoilAt(heft: number, age: number): number {
  if (age < 0) return 0;
  const back = 1 + Math.round(3 * heft);
  const hold = 2 + Math.round(2 * heft);
  const ret = 6 + Math.round(16 * heft);
  if (age < hold) return back;
  const k = Math.max(0, 1 - (age - hold) / ret);
  return Math.round(back * k * k);
}

/** Half width of the flash tongue at `u` (0 at the muzzle, 1 at its tip): a spade shape. */
function profile(u: number): number {
  return u < 0.35 ? 0.45 + (u / 0.35) * 0.55 : Math.max(0, (1 - u) / 0.65);
}

export class MuzzleKick {
  private shots: Shot[] = [];

  /** A `muzzle` event at the barrel tip (x, y), aim in degrees; finds the tank that fired. */
  fire(
    x: number,
    y: number,
    angleDeg: number,
    heft: number,
    tick: number,
    tanks: readonly KickTank[],
    ground: KickGround,
    sink: ParticleSink,
    mult: number,
    air?: Pick<FluidSink, 'splat'>,
  ): void {
    let player = -1;
    let best = 400;
    let base: KickTank | null = null;
    for (const t of tanks) {
      if (!t.alive) continue;
      const d = (t.x - x) ** 2 + (t.y - 6 - y) ** 2;
      if (d < best) {
        best = d;
        player = t.player;
        base = t;
      }
    }
    const a = (angleDeg * Math.PI) / 180;
    const shot: Shot = { x, y, a, heft, start: tick, player, seed: hash(tick, x * 31 + y) };
    this.shots = this.shots.filter((s) => s.player !== player || player < 0);
    this.shots.push(shot);
    const bx = base ? base.x : x;
    const by = base ? base.y : y + 8;
    this.blowDust(shot, bx, by, ground, sink, mult);
    this.smoke(shot, sink, mult);
    if (air) {
      // the blast shoves the air: out along the barrel, and outward along the ground under it
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const push = 1 + 3 * heft;
      air.splat(x + ca * 4, y - sa * 4, 6 + 10 * heft, ca * push, -sa * push, 0, 0);
      air.splat(bx + ca * 6, by - 2, 10 + 22 * heft, 0.6 + 2.4 * heft, 0, 0, 0, 0, true);
    }
  }

  /**
   * The blast hits the ground around the tank: dust sheets off the surface both ways, thickest
   * on the side the barrel points and nearest the tracks, and big guns kick up clods of it.
   */
  private blowDust(
    s: Shot,
    bx: number,
    by: number,
    ground: KickGround,
    sink: ParticleSink,
    mult: number,
  ): void {
    const reach = Math.round(8 + 26 * s.heft);
    const ca = Math.cos(s.a);
    // a low barrel blasts the ground hard; one pointing straight up mostly blows down on the hull
    const low = 0.55 + 0.45 * Math.abs(ca);
    const k = Math.max(0.35, mult);
    let n = 0;
    const cap = Math.round((10 + 70 * s.heft) * k);
    for (let dx = -reach; dx <= reach && n < cap; dx++) {
      const gx = Math.round(bx + dx);
      let gy = -1;
      for (let dy = -10; dy < 14; dy++) {
        const yy = Math.round(by) + dy;
        if (ground.solid(gx, yy)) {
          gy = yy;
          break;
        }
      }
      if (gy < 0) continue;
      const side = dx === 0 ? 0 : Math.sign(dx);
      const toward = side * Math.sign(ca);
      // the blast reaches further out under the barrel than behind the tank
      const span = (reach + 1) * (toward > 0 ? 1 : toward < 0 ? 0.6 : 0.8);
      const near = 1 - Math.abs(dx) / span;
      if (near <= 0) continue;
      // nothing under the hull itself: the tracks keep their own ground
      if (Math.abs(dx) <= 6) continue;
      const r = hash(s.seed, dx + 999);
      const bias = toward > 0 ? 1 : toward < 0 ? 0.6 : 0.8;
      const out = side === 0 ? ((r >>> 9) & 1 ? 1 : -1) : side;
      const col = ground.dust(gx, gy);
      // two puffs per column close in, one further out
      const puffs = near > 0.5 ? 2 : 1;
      for (let p = 0; p < puffs; p++) {
        const rr = hash(r, p);
        if ((rr & 255) / 255 > near * bias * 1.6) continue;
        const sp = (0.6 + 2.8 * s.heft) * low * (0.3 + near) * (0.6 + ((rr >>> 12) & 255) / 500);
        sink.add({
          x: gx + 0.5,
          y: gy - 0.5 - p,
          vx: out * sp,
          vy: -(0.04 + ((rr >>> 20) & 255) / 1600) * (0.5 + s.heft) * low,
          life: 26 + ((rr >>> 4) & 31) + Math.round(46 * s.heft),
          size: 2 + ((rr >>> 24) & 3) * 0.5 + s.heft * 2.5,
          color: col,
          kind: PKind.Dust,
        });
        n++;
      }
      // clods and grit flung off the surface by the bigger guns
      if (s.heft >= 0.45 && near > 0.35 && ((r >>> 14) & 3) === 0) {
        const sp = (0.4 + 1.4 * s.heft) * near * low;
        sink.add({
          x: gx + 0.5,
          y: gy - 1,
          vx: out * sp * 0.8,
          vy: -(0.6 + 1.2 * s.heft) * near,
          life: 30 + ((r >>> 18) & 15),
          size: 1,
          color: col,
          kind: PKind.Chunk,
        });
      }
    }
  }

  /** A gout of grey smoke rolled out along the barrel, braking as it goes. */
  private smoke(s: Shot, sink: ParticleSink, mult: number): void {
    if (s.heft < 0.3) return;
    const ca = Math.cos(s.a);
    const sa = Math.sin(s.a);
    const n = Math.round((2 + 7 * s.heft) * Math.max(0.4, mult));
    for (let i = 0; i < n; i++) {
      const r = hash(s.seed, i + 77);
      const f = 0.3 + (i / n) * (1.2 + s.heft);
      const wob = (((r >>> 8) & 255) / 255 - 0.5) * 0.5;
      sink.add({
        x: s.x + ca * i * 0.8,
        y: s.y - sa * i * 0.8,
        vx: ca * f + wob * sa,
        vy: -sa * f + wob * ca - 0.05,
        life: 40 + ((r >>> 16) & 31) + Math.round(40 * s.heft),
        size: 2.5 + s.heft * 3 + ((r >>> 24) & 3) * 0.5,
        color: 0x5c5458,
        kind: PKind.Smoke,
      });
    }
  }

  /** Cells this player's barrel is pulled back at tick `t`. */
  recoil(player: number, t: number): number {
    for (const s of this.shots) if (s.player === player) return recoilAt(s.heft, t - s.start);
    return 0;
  }

  /** Cells the hull is rocked back along x at tick `t` (heavy guns only). */
  jolt(player: number, t: number): number {
    for (const s of this.shots) {
      if (s.player !== player || s.heft < 0.5) continue;
      const age = t - s.start;
      const len = s.heft >= 0.85 ? 4 : 2;
      if (age < 0 || age >= len) return 0;
      const back = -Math.sign(Math.cos(s.a)) || 0;
      return back;
    }
    return 0;
  }

  prune(t: number): void {
    if (this.shots.length === 0) return;
    this.shots = this.shots.filter((s) => t - s.start <= KEEP);
  }

  /** The flash tongues and muzzle-brake jets, whole cells. */
  draw(b: QuadBatch, t: number): void {
    for (const s of this.shots) {
      const age = t - s.start;
      const life = flashTicks(s.heft);
      if (age < 0 || age >= life) continue;
      const ca = Math.cos(s.a);
      const sa = Math.sin(s.a);
      const len = Math.round(4 + 12 * s.heft);
      const wide = 1 + 3 * s.heft;
      // later ticks: the tongue tears off the muzzle and cools a band
      const cool = age / life;
      const from = Math.round(age * (1 + s.heft * 1.5));
      const to = Math.round(len * (1 - 0.25 * cool));
      this.tongue(b, s, ca, sa, from, to, len, wide * (1 - 0.35 * cool), cool, 0);
      if (s.heft >= 0.4 && age < 2) {
        // muzzle-brake jets, thrown out to both sides and a little back
        const jl = Math.max(2, Math.round(len * 0.32));
        for (const side of [-1, 1]) {
          const ja = s.a + side * (Math.PI * 0.62);
          const jc = Math.cos(ja);
          const js = Math.sin(ja);
          this.tongue(b, s, jc, js, 0, jl, jl, 0.5 + s.heft, cool + 0.2, side * 5);
        }
      }
    }
  }

  private tongue(
    b: QuadBatch,
    s: Shot,
    ca: number,
    sa: number,
    from: number,
    to: number,
    len: number,
    wide: number,
    cool: number,
    salt: number,
  ): void {
    for (let i = Math.max(0, from); i <= to; i++) {
      const u = i / Math.max(1, len);
      const hw = wide * profile(u);
      const ax = s.x + ca * i;
      const ay = s.y - sa * i;
      const span = Math.ceil(hw);
      for (let j = -span; j <= span; j++) {
        const d = Math.abs(j) / Math.max(0.5, hw);
        if (d > 1) continue;
        const r = hash(s.seed + salt, i * 17 + j);
        // ragged edges: the outer cells flicker out
        if (d > 0.55 && (r & 3) === 0) continue;
        const heat = d + u * 0.55 + cool * 0.7 + ((r >>> 8) & 255) / 1400;
        const c = heat < 0.45 ? CORE : heat < 0.85 ? HOT : heat < 1.25 ? EDGE : EMBER;
        b.rect(Math.round(ax + sa * j), Math.round(ay + ca * j), 1, 1, c);
      }
    }
  }

  clear(): void {
    this.shots = [];
  }
}

import { PKind, type ParticleSink } from './particles';

/**
 * Tanks flinch (renderer only): a blast close to a tank rocks it. The hull is shoved a cell or
 * two away from the blast and bounced up off its tracks as the blast front reaches it, then
 * settles back, and dust shakes out from under the tracks. Nearer and bigger blasts rock harder.
 * Only the picture moves, in whole cells; the sim's tank never does.
 */

export interface FlinchTank {
  player: number;
  x: number;
  y: number;
  alive: boolean;
}

interface Flinch {
  /** Tick the blast front reaches the tank. */
  at: number;
  /** Away from the blast: -1 left, 1 right. */
  dir: number;
  /** Strength 0..1. */
  k: number;
}

/** Ticks a flinch lasts. */
export const FLINCH_TICKS = 14;
/** How fast the blast front reaches a tank, cells per tick (it arrives in a few ticks). */
const FRONT_SPEED = 6;

/** Hull offset in whole cells `age` ticks after the front reached it. */
export function flinchOffset(age: number, k: number, dir: number): [number, number] {
  if (age < 0 || age >= FLINCH_TICKS || k <= 0) return [0, 0];
  const u = age / FLINCH_TICKS;
  // shoved out at once, then eased back; the hop is one quick arc in the first half
  const shove = Math.round(dir * k * 2.4 * (1 - u) * (1 - u));
  const hop = u < 0.5 ? -Math.round(k * 2.2 * Math.sin(u * 2 * Math.PI)) : 0;
  return [shove, hop];
}

function hash(a: number, b: number): number {
  let x = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return (x ^ (x >>> 15)) >>> 0;
}

export class TankFlinch {
  private byPlayer: (Flinch | undefined)[] = [];

  /**
   * A blast of `radius` at (x, y): every live tank in reach (but out of the blast's heart, where
   * the sim's own hit shows) is rocked, and dust shakes out from its tracks.
   */
  blast(
    x: number,
    y: number,
    radius: number,
    tick: number,
    tanks: readonly FlinchTank[],
    dust: (x: number, y: number) => number,
    sink: ParticleSink,
    mult: number,
  ): void {
    if (radius < 6) return;
    const reach = radius * 2.6 + 10;
    for (const t of tanks) {
      if (!t.alive) continue;
      const dx = t.x - x;
      const d = Math.hypot(dx, t.y - 4 - y);
      if (d > reach) continue;
      const k = Math.min(1, (1 - d / reach) * (0.5 + radius / 40));
      if (k < 0.12) continue;
      const at = tick + Math.round(d / FRONT_SPEED);
      const prev = this.byPlayer[t.player];
      if (prev && prev.k > k && at - prev.at < FLINCH_TICKS) continue;
      const dir = dx === 0 ? 1 : Math.sign(dx);
      this.byPlayer[t.player] = { at, dir, k };
      // dust shaken out from under the tracks, thrown away from the blast
      const n = Math.round((2 + 6 * k) * Math.max(0.35, mult));
      for (let i = 0; i < n; i++) {
        const r = hash(tick * 7 + t.player, i);
        const side = i % 2 === 0 ? -1 : 1;
        sink.add({
          x: t.x + side * (4 + ((r >>> 4) & 3)) + 0.5,
          y: t.y - 0.5,
          vx: dir * (0.3 + k * 1.2) * (0.5 + ((r >>> 8) & 255) / 512) + side * 0.15,
          vy: -(0.05 + ((r >>> 16) & 255) / 1400) * (1 + k),
          life: 22 + ((r >>> 24) & 31),
          size: 2 + k * 2 + ((r >>> 28) & 1),
          color: dust(Math.round(t.x), Math.round(t.y)),
          kind: PKind.Dust,
        });
      }
    }
  }

  /** Hull offset in cells for this player's tank at tick `t`. */
  offset(player: number, t: number): [number, number] {
    const f = this.byPlayer[player];
    if (!f) return [0, 0];
    return flinchOffset(t - f.at, f.k, f.dir);
  }

  clear(): void {
    this.byPlayer = [];
  }
}

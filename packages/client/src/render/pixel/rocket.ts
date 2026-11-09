import type { QuadBatch as Batch } from './batch';
import type { FluidSink } from './fluid';
import { PKind, type ParticleSink } from './particles';

/**
 * V3 Rocket visuals (pixel renderer): the `rocket` and `stage` shell looks. Each tracked shell
 * remembers where it was last tick, so the body can point along its flight and the exhaust can be
 * laid down along the whole move. The `v3Burn` effect event (with the shell's `id`) tells which
 * stage is burning: stage 1 fizzes a short flame, stages 2 and 3 roar a long white-hot plume and
 * pour a thick smoke trail into the fluid. Spent stages tumble end over end trailing smoke.
 */

interface Track {
  x: number;
  y: number;
  dx: number;
  dy: number;
  stage: number;
  /** Fx tick the current stage lit (for the ignition flare). */
  lit: number;
  seen: number;
}

/** Exhaust colour bands, hottest first. */
const PLUME = [0xffffff, 0xfff0a0, 0xffc040, 0xff7a20, 0xd04010] as const;
/** Rocket body: white nose, the black-and-white roll pattern, dark fins. */
const NOSE = 0xf4f4f0;
const BODY_A = 0xe8e8e0;
const BODY_B = 0x2a2a30;
const FIN = 0x3a3a44;

export class Rockets {
  private readonly tracks = new Map<number, Track>();

  constructor(
    private readonly particles: ParticleSink,
    private readonly fluid: () => FluidSink | null,
  ) {}

  /** A `v3Burn` event: shell `id` lit `stage`. */
  burn(id: number, stage: number, tick: number): void {
    const t = this.tracks.get(id);
    if (t) {
      t.stage = stage;
      t.lit = tick;
    } else this.tracks.set(id, { x: NaN, y: NaN, dx: 0, dy: 0, stage, lit: tick, seen: tick });
  }

  clear(): void {
    this.tracks.clear();
  }

  /** One cosmetic tick for a `rocket` or `stage` shell at (x, y). */
  step(id: number, x: number, y: number, spent: boolean, tick: number, mult: number): void {
    let t = this.tracks.get(id);
    if (!t) {
      t = { x, y, dx: 0, dy: -1, stage: 1, lit: -100, seen: tick };
      this.tracks.set(id, t);
    }
    if (Number.isNaN(t.x)) {
      t.x = x;
      t.y = y;
    }
    const dx = x - t.x;
    const dy = y - t.y;
    const x0 = t.x;
    const y0 = t.y;
    t.x = x;
    t.y = y;
    t.seen = tick;
    if (Math.abs(dx) > 40 || Math.abs(dy) > 40) return; // wrapped or teleported
    if (dx * dx + dy * dy > 0.01) {
      t.dx = dx;
      t.dy = dy;
    }
    let r = (Math.imul(tick + 1, 2654435761) ^ Math.imul(id + 1, 40503)) >>> 0;
    const next = (): number => {
      r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      return r;
    };
    const len = Math.hypot(t.dx, t.dy) || 1;
    const ux = t.dx / len;
    const uy = t.dy / len;
    if (spent) {
      // a tumbling burnt-out stage: a dribble of smoke and the odd dying spark
      if ((next() & 1) === 0)
        this.particles.add({
          x,
          y,
          vx: 0,
          vy: -0.05,
          life: 40 + (next() & 15),
          size: 2,
          color: 0x5a5660,
          kind: PKind.Smoke,
        });
      if ((next() & 3) === 0)
        this.particles.add({
          x,
          y,
          vx: ((next() & 7) - 3.5) * 0.06,
          vy: -0.1,
          life: 8 + (next() & 7),
          size: 1,
          color: 0xff9a30,
          kind: PKind.Spark,
        });
      return;
    }
    const roar = t.stage >= 2;
    // lay the exhaust along the whole move so a fast rocket leaves an unbroken plume
    const steps = Math.max(1, Math.min(12, Math.ceil(Math.hypot(dx, dy) / 1.2)));
    const tail = roar ? 3.5 : 2.5;
    for (let i = 0; i < steps; i++) {
      const f = i / steps;
      const px = x0 + dx * f - ux * tail;
      const py = y0 + dy * f - uy * tail;
      const n = roar ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const s = next();
        this.particles.add({
          x: px + ((s & 3) - 1.5) * 0.4,
          y: py + (((s >>> 2) & 3) - 1.5) * 0.4,
          vx: -ux * (roar ? 0.9 : 0.4) + (((s >>> 4) & 7) - 3.5) * 0.05,
          vy: -uy * (roar ? 0.9 : 0.4) + (((s >>> 7) & 7) - 3.5) * 0.05,
          life: (roar ? 7 : 4) + ((s >>> 10) & 7),
          size: 1,
          color: PLUME[(s >>> 13) % (roar ? 3 : 5)]!,
          kind: PKind.Spark,
        });
      }
      if (roar && (next() & 1) === 0)
        this.particles.add({
          x: px,
          y: py,
          vx: -ux * 0.3,
          vy: -uy * 0.3,
          life: 8 + (next() & 7),
          size: 2,
          color: 0,
          kind: PKind.Flame,
        });
    }
    // a thick smoke trail behind a burning booster: into the fluid where it can, else puffs
    const fl = this.fluid();
    const sx = x - ux * (tail + 3);
    const sy = y - uy * (tail + 3);
    if (fl) {
      fl.splat(sx, sy, roar ? 3.5 : 2, -ux * 0.4, -uy * 0.4, roar ? 0.45 : 0.15, roar ? 0.2 : 0);
    } else if (mult > 0 && (next() & (roar ? 1 : 3)) === 0) {
      this.particles.add({
        x: sx,
        y: sy,
        vx: 0,
        vy: -0.03,
        life: roar ? 90 : 50,
        size: roar ? 4 : 2,
        color: 0xa8a4ac,
        kind: PKind.Smoke,
      });
    }
  }

  /** Forget shells that weren't stepped this tick. */
  prune(tick: number): void {
    for (const [id, t] of this.tracks) if (t.seen < tick - 2) this.tracks.delete(id);
  }

  /** Draw a `rocket` shell: a 7-cell body pointed along its flight, fins, and the flame. */
  drawRocket(id: number, ex: number, ey: number, tick: number, g: Batch, normal: Batch): void {
    const t = this.tracks.get(id);
    const dx = t?.dx ?? 0;
    const dy = t?.dy ?? -1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const cell = (k: number, side: number): [number, number] => [
      Math.floor(ex - ux * k - uy * side) + 0.5,
      Math.floor(ey - uy * k + ux * side) + 0.5,
    ];
    // the flame first, so the body sits over it
    const stage = t?.stage ?? 1;
    const flick = (Math.imul(tick + 3, 2654435761) ^ Math.imul(id, 40503)) >>> 28;
    const flame = stage >= 2 ? 6 + (flick & 3) : 2 + (flick & 1);
    for (let k = flame; k >= 1; k--) {
      const [fx, fy] = cell(6 + k, 0);
      const band = Math.min(PLUME.length - 1, Math.floor((k / flame) * PLUME.length));
      const w = stage >= 2 && k < flame - 1 ? 2 : 1;
      g.push(fx, fy, w, w, PLUME[band]!, 1);
    }
    // a flare where a new stage just lit
    if (t && tick - t.lit < 6) {
      const [fx, fy] = cell(7, 0);
      g.push(fx, fy, 7, 7, 0xffe0a0, 0.5);
      g.push(fx, fy, 3, 3, 0xffffff, 1);
    }
    for (let k = 1; k <= 6; k++) {
      const [bx, by] = cell(k, 0);
      // the roll pattern: two cells of white, one of black, so the spin reads in flight
      normal.push(bx, by, 1, 1, (k + (tick >> 2)) % 3 === 0 ? BODY_B : BODY_A, 1);
    }
    for (const side of [-1, 1]) {
      const [fx, fy] = cell(6, side);
      normal.push(fx, fy, 1, 1, FIN, 1);
      const [gx, gy] = cell(5, side);
      normal.push(gx, gy, 1, 1, FIN, 1);
    }
    const [nx, ny] = cell(0, 0);
    normal.push(nx, ny, 1, 1, NOSE, 1);
    if (stage >= 3) g.push(nx, ny, 1, 1, 0xff4020, ((tick >> 1) & 1) === 0 ? 1 : 0.3);
  }

  /** Draw a `stage` shell: a short casing (light end, dark middle, finned end) tumbling. */
  drawStage(id: number, ex: number, ey: number, tick: number, normal: Batch): void {
    const a = ((tick + id * 5) >> 2) & 7;
    const [ux, uy] = TUMBLE[a]!;
    for (let k = -1; k <= 1; k++) {
      const x = Math.floor(ex) + ux * k + 0.5;
      const y = Math.floor(ey) + uy * k + 0.5;
      normal.push(x, y, 1, 1, k === 1 ? FIN : k === 0 ? BODY_B : 0x9a98a0, 1);
    }
  }
}

/** The eight directions a tumbling stage points, one turn in eighths. */
const TUMBLE: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

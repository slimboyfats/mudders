import type { QuadBatch as Batch } from './batch';
import type { FluidSink } from './fluid';
import { PKind, type ParticleSink } from './particles';
import type { FlightStyle } from '../types';

/**
 * In-flight shell looks for plain (`spark`) shells, one per weapon family (renderer only, never
 * read by the sim). Each shell remembers where it was last tick, so its body can point along its
 * flight, and every family draws a small pixel body and sheds its own trail:
 *
 * - `missile` a finned body with a flickering exhaust flame and a short grey pixel smoke trail;
 * - `bomb` a fat finned casing with a hazard band and a blinking light, pouring thick dark smoke;
 * - `homing` a white seeker with a blinking green eye, its exhaust and smoke weaving side to side;
 * - `bomblet` a small casing tumbling end over end, shedding embers;
 * - `flask` a sloshing canister of burning liquid, dripping fire and embers;
 * - `charge` a pulsing energy ball with arcs crackling round it and a glittering wake;
 * - `drill` a pointed bit whose thread turns as it flies, spitting grey sparks;
 * - `clod` a lump of earth tumbling and shedding crumbs;
 * - `roller` a steel ball with a notch rolling round its rim;
 * - `warp` a core with two motes orbiting it, leaving a twisted double trail;
 * - `prism` an orb cycling through colours, throwing glitter;
 * - `beacon` a dark canister with a blinking red light;
 * - `medic` a white capsule with a blinking green cross.
 *
 * Everything sits on whole map cells (§2a): bodies are single cells, flames step through hard
 * colour bands, smoke is single-cell wisps that thin out cell by cell.
 */

interface Track {
  x: number;
  y: number;
  /** Heading (unit vector), kept from the last real move. */
  ux: number;
  uy: number;
  /** Cells moved last tick (speed). */
  sp: number;
  /** Fx tick it was first seen (age drives spin and the exhaust's light-up). */
  born: number;
  seen: number;
  /** Smoke ribbon: points laid along the flight (ring buffer), the tick each was laid, and how many. */
  sx: Float32Array | null;
  sy: Float32Array | null;
  st: Int32Array | null;
  sn: number;
  /** Ribbon look: 0 none, 1 missile grey, 2 homing white, 3 bomb black. */
  smoke: number;
}

/** Points in a smoke ribbon's ring buffer, and how long one lasts (ticks) by ribbon look. */
const RIBBON = 320;
const RIBBON_LIFE = [0, 46, 40, 70] as const;
/** Ribbon tones by look, young to old: steps paler as it thins. */
const RIBBON_TONES: readonly (readonly number[])[] = [
  [],
  [0x8a8690, 0xa8a4ae, 0xc4c0c8],
  [0xc8ccd2, 0xdcdfe4, 0xeef0f2],
  [0x3a3640, 0x55505a, 0x6e6a74],
];

/** Exhaust colour bands, hottest first. */
const PLUME = [0xffffff, 0xfff0a0, 0xffc040, 0xff7a20, 0xd04010] as const;
const FIRE = 0xffa020;
/** One turn in eighths, for tumbling and orbiting. */
const RING: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
/** Side-to-side weave of a homing exhaust, in cells per step along it. */
const WEAVE = [0, 1, 1, 0, 0, -1, -1, 0] as const;
const PRISM = [0xff50c0, 0xffe040, 0x50f0e0, 0x90ff50, 0xa070ff] as const;
/** A clod's cells (dx, dy) before it turns, and their tone index. */
const CLOD: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [1, 0, 1],
  [-1, 0, 0],
  [0, -1, 2],
  [1, -1, 3],
  [0, 1, 1],
  [-1, 1, 1],
];
const CLOD_TONES = [0x7a5a36, 0x5a4026, 0x9a7448, 0x58a038] as const;

export class Flights {
  private readonly tracks = new Map<number, Track>();

  constructor(
    private readonly particles: ParticleSink,
    private readonly fluid: () => FluidSink | null = () => null,
  ) {}

  clear(): void {
    this.tracks.clear();
  }

  /** Forget shells that weren't stepped lately. */
  prune(tick: number): void {
    for (const [id, t] of this.tracks) {
      if (t.seen >= tick - 2) continue;
      // a shell that burst keeps its smoke ribbon until the last of it has thinned away
      const last = t.st && t.sn > 0 ? t.st[(t.sn - 1) % RIBBON]! : -1e9;
      if (tick - last > RIBBON_LIFE[t.smoke]!) this.tracks.delete(id);
    }
  }

  /**
   * Smoke ribbons behind missiles and bombs: every laid point grows from one cell into a small
   * diamond as it ages, drifts up, steps paler and thins out cell by cell (each cell drops out on
   * its own hashed beat), so the trail reads as a column of pixel smoke that clears within about
   * a second and a half. `wind` leans the old smoke downwind.
   */
  drawSmoke(tick: number, wind: number, b: Batch): void {
    for (const [id, t] of this.tracks) {
      if (!t.sx || !t.sy || !t.st || t.smoke === 0) continue;
      const life = RIBBON_LIFE[t.smoke]!;
      const tones = RIBBON_TONES[t.smoke]!;
      const big = t.smoke === 3 ? 1 : 0;
      const n = Math.min(t.sn, RIBBON);
      for (let j = 0; j < n; j++) {
        const i = (t.sn - 1 - j) % RIBBON;
        const age = tick - t.st[i]!;
        if (age < 2 || age > life) continue;
        const f = age / life;
        const rad = (age < 6 ? 0 : age < 18 ? 1 : 2) + (age >= 10 ? big : 0);
        const lift = age * 0.05;
        const cx = Math.floor(t.sx[i]! + wind * age * age * 0.05) + 0.5;
        const cy = Math.floor(t.sy[i]! - lift) + 0.5;
        const tone = tones[f < 0.3 ? 0 : f < 0.65 ? 1 : 2]!;
        // fewer cells survive as it ages: none drop out early, all are gone at the end
        const keep = f < 0.25 ? 1 : (1 - f) / 0.75;
        for (let oy = -rad; oy <= rad; oy++) {
          const w = rad - Math.abs(oy);
          for (let ox = -w; ox <= w; ox++) {
            const h =
              (Math.imul((i + 1) * 73 + ox * 31 + oy * 17, 2654435761) ^
                Math.imul(id + 7, 40503)) >>>
              0;
            if ((h & 1023) / 1024 > keep) continue;
            b.push(cx + ox, cy + oy, 1, 1, tone, 1);
          }
        }
      }
    }
  }

  /**
   * One cosmetic tick for shell `id` at (x, y): remember its heading and shed its trail. `color`
   * is the weapon type's trail colour, `mult` the quality's particle multiplier (0 = fewest).
   */
  step(
    id: number,
    x: number,
    y: number,
    style: FlightStyle,
    color: number,
    tick: number,
    mult: number,
  ): void {
    let t = this.tracks.get(id);
    if (!t) {
      const smoke = style === 'missile' ? 1 : style === 'homing' ? 2 : style === 'bomb' ? 3 : 0;
      t = {
        x,
        y,
        ux: 0,
        uy: -1,
        sp: 0,
        born: tick,
        seen: tick,
        sx: smoke ? new Float32Array(RIBBON) : null,
        sy: smoke ? new Float32Array(RIBBON) : null,
        st: smoke ? new Int32Array(RIBBON) : null,
        sn: 0,
        smoke,
      };
      this.tracks.set(id, t);
    }
    const dx = x - t.x;
    const dy = y - t.y;
    const x0 = t.x;
    const y0 = t.y;
    t.x = x;
    t.y = y;
    t.seen = tick;
    if (Math.abs(dx) > 40 || Math.abs(dy) > 40) return; // wrapped or teleported
    const len = Math.hypot(dx, dy);
    t.sp = len;
    if (len > 0.05) {
      t.ux = dx / len;
      t.uy = dy / len;
    }
    const { ux, uy } = t;
    let r = (Math.imul(tick + 1, 2654435761) ^ Math.imul(id + 1, 40503)) >>> 0;
    const next = (): number => {
      r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      return r;
    };
    const jit = (s: number, k: number): number => ((s & 7) - 3.5) * k;
    const p = this.particles;
    // how many cells to lay along this tick's move so a fast shell leaves an unbroken trail
    const steps = Math.max(1, Math.min(8, Math.round(len / 1.5)));
    const thin = mult < 1;
    switch (style) {
      case 'missile':
      case 'homing':
      case 'bomb': {
        const bomb = style === 'bomb';
        const tail = bomb ? 5 : 4;
        for (let i = 0; i < steps; i++) {
          const f = (i + 1) / steps;
          const w = style === 'homing' ? WEAVE[(tick * 2 + i + id) & 7]! * 0.8 : 0;
          const px = x0 + dx * f - ux * tail - uy * w;
          const py = y0 + dy * f - uy * tail + ux * w;
          let s = next();
          // a lick of exhaust fire blown back off the nozzle
          p.add({
            x: px,
            y: py,
            vx: -ux * 0.5 + jit(s, 0.04),
            vy: -uy * 0.5 + jit(s >>> 3, 0.04),
            life: 3 + ((s >>> 6) & 3),
            size: 1,
            color: FIRE,
            kind: PKind.Fire,
          });
          // the smoke ribbon (see drawSmoke) gets a point here
          if (t.sx && t.sy && t.st) {
            const k = t.sn % RIBBON;
            t.sx[k] = px - ux * 1.5;
            t.sy[k] = py - uy * 1.5;
            t.st[k] = tick;
            t.sn++;
          }
          // and a few loose cells of smoke that the air carries off it
          const n = bomb ? 2 : thin ? 0 : 1;
          for (let k = 0; k < n; k++) {
            s = next();
            const side = (k - (n - 1) / 2) * 0.9 + jit(s, 0.12);
            p.add({
              x: px - ux * 1.5 - uy * side,
              y: py - uy * 1.5 + ux * side,
              vx: -ux * 0.06 + jit(s >>> 3, 0.02),
              vy: -uy * 0.06 - 0.02 + jit(s >>> 6, 0.02),
              life: (bomb ? 56 : 40) + ((s >>> 9) & 15),
              size: 1,
              color: bomb ? 0x5a5660 : style === 'homing' ? 0xe0e4e8 : 0xb8b4bc,
              kind: PKind.Wisp,
            });
          }
        }
        // and a puff into the smoke fluid, so the trail curls and drifts as real smoke
        const fl = this.fluid();
        if (fl)
          fl.splat(
            x - ux * (tail + 2),
            y - uy * (tail + 2),
            bomb ? 2.5 : 1.5,
            -ux * 0.25,
            -uy * 0.25,
            bomb ? 0.35 : 0.16,
            0.04,
          );
        // now and then a white-hot spark spat out of the nozzle
        if ((next() & 3) === 0) {
          const s = next();
          p.add({
            x: x - ux * tail,
            y: y - uy * tail,
            vx: -ux * 0.6 + jit(s, 0.08),
            vy: -uy * 0.6 + jit(s >>> 3, 0.08),
            life: 5 + ((s >>> 6) & 7),
            size: 1,
            color: (s >>> 9) & 1 ? 0xffffff : 0xffd060,
            kind: PKind.Spark,
          });
        }
        return;
      }
      case 'bomblet': {
        const s = next();
        if ((s & 1) === 0 || !thin)
          p.add({
            x: x + jit(s >>> 1, 0.2),
            y: y + jit(s >>> 4, 0.2),
            vx: -ux * 0.15 + jit(s >>> 7, 0.05),
            vy: -uy * 0.15 - 0.15,
            life: 14 + ((s >>> 10) & 15),
            size: 1,
            color: (s >>> 14) & 1 ? 0xffb040 : 0xff6020,
            kind: PKind.Ember,
          });
        if ((s >>> 16) % 3 === 0)
          p.add({
            x: x - ux,
            y: y - uy,
            vx: 0,
            vy: -0.03,
            life: 20 + ((s >>> 18) & 15),
            size: 1,
            color: 0x6a6670,
            kind: PKind.Wisp,
          });
        return;
      }
      case 'flask': {
        for (let i = 0; i < steps; i++) {
          const f = (i + 1) / steps;
          const s = next();
          p.add({
            x: x0 + dx * f - ux * 1.5 + jit(s, 0.15),
            y: y0 + dy * f - uy * 1.5 + jit(s >>> 3, 0.15),
            vx: -ux * 0.25 + jit(s >>> 6, 0.04),
            vy: -uy * 0.25 - 0.08,
            life: 6 + ((s >>> 9) & 7),
            size: 1,
            color: FIRE,
            kind: PKind.Fire,
          });
        }
        const s = next();
        if ((s & 1) === 0)
          p.add({
            x,
            y: y + 1,
            vx: jit(s >>> 1, 0.05),
            vy: 0.1,
            life: 12 + ((s >>> 4) & 7),
            size: 1,
            color: (s >>> 8) & 1 ? 0xffd040 : 0xff7020,
            kind: PKind.Spark,
          });
        if ((s >>> 12) % 3 === 0)
          p.add({
            x,
            y,
            vx: jit(s >>> 14, 0.08),
            vy: -0.3,
            life: 30 + ((s >>> 18) & 31),
            size: 1,
            color: 0xff8a20,
            kind: PKind.Ember,
          });
        return;
      }
      case 'charge': {
        for (let i = 0; i < steps; i++) {
          const f = (i + 1) / steps;
          const s = next();
          if (thin && s & 1) continue;
          p.add({
            x: x0 + dx * f + jit(s >>> 1, 0.3),
            y: y0 + dy * f + jit(s >>> 4, 0.3),
            vx: jit(s >>> 7, 0.03),
            vy: jit(s >>> 10, 0.03),
            life: 10 + ((s >>> 13) & 15),
            size: 1,
            color: (s >>> 18) % 3 === 0 ? 0xffffff : color,
            kind: PKind.Glitter,
          });
        }
        return;
      }
      case 'drill': {
        const s = next();
        p.add({
          x: x - ux * 3,
          y: y - uy * 3,
          vx: -ux * 0.4 - uy * jit(s, 0.12),
          vy: -uy * 0.4 + ux * jit(s, 0.12),
          life: 5 + ((s >>> 3) & 7),
          size: 1,
          color: (s >>> 6) % 3 === 0 ? 0xffffff : 0xb8bcc4,
          kind: PKind.Spark,
        });
        if (((s >>> 9) & 3) === 0)
          p.add({
            x: x - ux * 3,
            y: y - uy * 3,
            vx: 0,
            vy: -0.02,
            life: 24 + ((s >>> 11) & 15),
            size: 1,
            color: 0x8a8690,
            kind: PKind.Wisp,
          });
        return;
      }
      case 'clod': {
        const s = next();
        if ((s & 3) === 0 || (!thin && (s & 3) === 1))
          p.add({
            x: x + jit(s >>> 2, 0.25),
            y: y + 1,
            vx: -ux * 0.1 + jit(s >>> 5, 0.04),
            vy: 0.05,
            life: 16 + ((s >>> 8) & 15),
            size: 1,
            color: CLOD_TONES[(s >>> 12) % 3]!,
            kind: PKind.Chunk,
          });
        return;
      }
      case 'roller':
        return;
      case 'warp': {
        // the two orbiting motes leave a cell each where they pass: a twisted double trail
        const a = (tick - t.born + id) & 7;
        for (const o of [0, 4]) {
          const [ox, oy] = RING[(a + o) & 7]!;
          const s = next();
          p.add({
            x: x + ox * 2,
            y: y + oy * 2,
            vx: 0,
            vy: 0,
            life: 14 + ((s >>> 3) & 7),
            size: 1,
            color: s % 3 === 0 ? 0xffffff : color,
            kind: PKind.Spark,
          });
        }
        return;
      }
      case 'prism': {
        const s = next();
        if ((s & 1) === 0)
          p.add({
            x: x + jit(s >>> 1, 0.4),
            y: y + jit(s >>> 4, 0.4),
            vx: jit(s >>> 7, 0.06),
            vy: jit(s >>> 10, 0.06),
            life: 14 + ((s >>> 13) & 15),
            size: 1,
            color: PRISM[(s >>> 17) % PRISM.length]!,
            kind: PKind.Glitter,
          });
        return;
      }
      case 'beacon':
      case 'medic': {
        const s = next();
        if ((s & 3) === 0)
          p.add({
            x: x - ux * 2,
            y: y - uy * 2,
            vx: -ux * 0.2,
            vy: -uy * 0.2,
            life: 6 + ((s >>> 2) & 7),
            size: 1,
            color: style === 'medic' ? 0x60f090 : 0xff4040,
            kind: PKind.Spark,
          });
        return;
      }
    }
  }

  /** Draw shell `id` at (ex, ey) in its family's look. */
  draw(
    id: number,
    ex: number,
    ey: number,
    style: FlightStyle,
    color: number,
    tick: number,
    g: Batch,
    b: Batch,
  ): void {
    const t = this.tracks.get(id);
    const ux = t?.ux ?? 0;
    const uy = t?.uy ?? -1;
    const age = t ? tick - t.born : 0;
    const cell = (k: number, side: number): [number, number] => [
      Math.floor(ex - ux * k - uy * side) + 0.5,
      Math.floor(ey - uy * k + ux * side) + 0.5,
    ];
    const put = (batch: Batch, k: number, side: number, c: number, a = 1): void => {
      const [cx, cy] = cell(k, side);
      batch.push(cx, cy, 1, 1, c, a);
    };
    const flick = (Math.imul(tick + 3, 2654435761) ^ Math.imul(id + 1, 40503)) >>> 28;
    switch (style) {
      case 'missile':
      case 'homing': {
        const homing = style === 'homing';
        // the flame first, so the body sits over it
        const flame = 2 + (flick & 3);
        for (let k = flame; k >= 1; k--) {
          const band = Math.min(PLUME.length - 1, Math.floor(((k - 1) / flame) * PLUME.length));
          const w = homing ? WEAVE[(tick + k * 2 + id) & 7]! >> 0 : 0;
          put(g, 3 + k, k > 2 ? w : 0, PLUME[band]!);
        }
        put(b, 0, 0, homing ? 0xf4f4f0 : 0xd8d4cc);
        put(b, 1, 0, homing ? 0xe8e8e0 : color);
        put(b, 2, 0, homing ? 0xe8e8e0 : 0xa8a49c);
        put(b, 3, 0, 0x3a3a44);
        put(b, 3, -1, 0x3a3a44);
        put(b, 3, 1, 0x3a3a44);
        if (homing) put(g, 0, 0, 0x50ff70, ((tick + id) >> 2) & 1 ? 1 : 0.35);
        else put(g, 0, 0, 0xffffff, 0.5);
        return;
      }
      case 'bomb': {
        const flame = 1 + (flick & 1);
        for (let k = flame; k >= 1; k--) put(g, 4 + k, 0, PLUME[k + 1]!);
        const casing = 0x5a6040;
        put(b, 0, 0, 0x7a8058);
        for (let k = 1; k <= 3; k++)
          for (let s = -1; s <= 1; s++) {
            // a hazard band round the middle: yellow and black in turn
            const c = k === 2 ? (((s + 1 + (tick >> 3)) & 1) === 0 ? 0xf0c020 : 0x1a1a1a) : casing;
            put(b, k, s, s === 0 && k !== 2 ? 0x6a7048 : c);
          }
        put(b, 4, 0, 0x2a2a30);
        put(b, 4, -2, 0x2a2a30);
        put(b, 4, 2, 0x2a2a30);
        put(b, 5, -2, 0x2a2a30);
        put(b, 5, 2, 0x2a2a30);
        put(g, 0, 0, 0xff3020, ((tick + id) >> 3) & 1 ? 1 : 0.2);
        return;
      }
      case 'bomblet': {
        const [ox, oy] = RING[((age + id * 3) >> 1) & 7]!;
        const x = Math.floor(ex) + 0.5;
        const y = Math.floor(ey) + 0.5;
        b.push(x - ox, y - oy, 1, 1, 0x3a3a44, 1);
        b.push(x, y, 1, 1, 0x6a6a74, 1);
        g.push(x + ox, y + oy, 1, 1, (flick & 1) === 0 ? 0xfff0a0 : color, 1);
        return;
      }
      case 'flask': {
        // a glass flask, its burning load sloshing from side to side, a flame licking off the neck
        const slosh = ((age + id) >> 2) & 1 ? 1 : -1;
        const x = Math.floor(ex) + 0.5;
        const y = Math.floor(ey) + 0.5;
        b.push(x - 0.5, y - 0.5, 2, 2, 0x8a3010, 1);
        g.push(slosh > 0 ? x : x - 1, y, 1, 1, 0xffa020, 1);
        b.push(x, y - 2, 1, 1, 0xc8d8d0, 1);
        g.push(x, y - 3, 1, 1, PLUME[1 + (flick % 3)]!, 1);
        return;
      }
      case 'charge': {
        // a white-hot heart, a cross of light turning about it, and arcs that crackle off it
        const x = Math.floor(ex) + 0.5;
        const y = Math.floor(ey) + 0.5;
        const turn = (tick >> 1) & 1;
        for (let i = turn; i < 8; i += 2) {
          const [ox, oy] = RING[i]!;
          g.push(x + ox, y + oy, 1, 1, color, 0.9);
        }
        g.push(x, y, 1, 1, 0xffffff, 1);
        let r = (Math.imul(tick + 11, 2654435761) ^ Math.imul(id + 5, 40503)) >>> 0;
        for (let arc = 0; arc < 2; arc++) {
          r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
          if (r & 1) continue;
          let ax = 0;
          let ay = 0;
          const [dx, dy] = RING[(r >>> 1) & 7]!;
          for (let k = 0; k < 3; k++) {
            ax += dx;
            ay += dy;
            if ((r >>> (4 + k)) & 1) ax += dy !== 0 ? 1 : 0;
            else ay += dx !== 0 ? 1 : 0;
            g.push(x + ax, y + ay, 1, 1, k === 0 ? 0xffffff : color, 1 - k * 0.25);
          }
        }
        return;
      }
      case 'drill': {
        // a cone: tip, then two rings of three, the thread stepping along it as it turns
        put(b, 0, 0, 0xf0f0f4);
        for (let k = 1; k <= 2; k++)
          for (let s = -1; s <= 1; s++) {
            const lit = ((k + s + (tick >> 1)) & 1) === 0;
            put(b, k, s, lit ? 0xc8ccd4 : 0x5a5e66);
          }
        put(b, 3, 0, 0x3a3a44);
        put(g, 4, 0, (flick & 1) === 0 ? 0xffffff : 0xffc040);
        return;
      }
      case 'clod': {
        const q = ((age + id) >> 2) & 3;
        const x = Math.floor(ex) + 0.5;
        const y = Math.floor(ey) + 0.5;
        for (const [cx, cy, tone] of CLOD) {
          // quarter turns: (x, y) → (-y, x)
          const rx = q === 0 ? cx : q === 1 ? -cy : q === 2 ? -cx : cy;
          const ry = q === 0 ? cy : q === 1 ? cx : q === 2 ? -cy : -cx;
          b.push(x + rx, y + ry, 1, 1, CLOD_TONES[tone]!, 1);
        }
        return;
      }
      case 'roller': {
        // a round steel ball: a plus of cells, a light top-left, a dark notch rolling round it
        const x = Math.floor(ex) + 0.5;
        const y = Math.floor(ey) + 0.5;
        b.push(x, y, 3, 1, 0x9aa2aa, 1);
        b.push(x, y, 1, 3, 0x9aa2aa, 1);
        b.push(x - 1, y - 1, 1, 1, 0xe0e6ec, 1);
        b.push(x + 1, y + 1, 1, 1, 0x5a6068, 1);
        const dir = ux >= 0 ? 1 : -1;
        const a = ((((age >> 1) * dir) % 8) + 8) % 8;
        const [ox, oy] = RING[a]!;
        if (ox === 0 || oy === 0) b.push(x + ox, y + oy, 1, 1, 0x30343a, 1);
        return;
      }
      case 'warp': {
        const x = Math.floor(ex) + 0.5;
        const y = Math.floor(ey) + 0.5;
        const a = (age + id) & 7;
        b.push(x - 0.5, y - 0.5, 2, 2, color, 1);
        g.push(x - 1, y - 1, 1, 1, 0xffffff, 0.8);
        for (const o of [0, 4]) {
          const [ox, oy] = RING[(a + o) & 7]!;
          g.push(x + ox * 2, y + oy * 2, 1, 1, o === 0 ? 0xffffff : color, 1);
        }
        return;
      }
      case 'prism': {
        const x = Math.floor(ex) + 0.5;
        const y = Math.floor(ey) + 0.5;
        const c = PRISM[((age + id) >> 2) % PRISM.length]!;
        const c2 = PRISM[(((age + id) >> 2) + 2) % PRISM.length]!;
        b.push(x, y, 3, 1, c, 1);
        b.push(x, y, 1, 3, c, 1);
        g.push(x, y, 1, 1, c2, 1);
        g.push(x, y, 1, 1, 0xffffff, (flick & 3) === 0 ? 1 : 0.4);
        return;
      }
      case 'beacon':
      case 'medic': {
        const x = Math.floor(ex) + 0.5;
        const y = Math.floor(ey) + 0.5;
        const medic = style === 'medic';
        b.push(x, y, 3, 3, medic ? 0xe8ece8 : 0x2a2a30, 1);
        const on = ((age + id) >> 3) & 1;
        if (medic) {
          const c = on ? 0x30d060 : 0x208040;
          b.push(x, y, 3, 1, c, 1);
          b.push(x, y, 1, 3, c, 1);
        } else g.push(x, y - 2, 1, 1, 0xff3030, on ? 1 : 0.25);
        return;
      }
    }
  }
}

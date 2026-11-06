import { Shape, type QuadBatch } from './batch';
import { FxRng } from './gl';
import { shade } from './theme';

/**
 * Pixel-art tornado (render-only, §2a) for the sim's per-tick `tornado` effect events: a dark
 * rotating wall cloud, a funnel that lowers out of it and touches down, wind bands wrapping
 * round the funnel row by row (lit in front, dim behind), and a dust skirt at the base. The sim's
 * own debris whirls inside it. Every row is snapped to map cells with hard bands, no smooth glow,
 * and the look is a pure function of the event stream, so captures replay exactly.
 */

/** Storm-cloud ramp, light to dark, one hard step per entry. */
const CLOUD = [0x9a96a0, 0x7a7684, 0x5e5a68, 0x47434f, 0x34313b] as const;
const N_CLOUD = 64;

export interface Funnel {
  x: number;
  /** Ground row under the base. */
  y: number;
  /** Funnel height in cells. */
  h: number;
  base: number;
  top: number;
  lean: number;
  wobble: number;
  /** Sim age of the latest event (drives the sway, so it matches the sim's debris). */
  age: number;
  /** 0..1 how much tornado there is; 0..1 how far the funnel has come down. */
  strength: number;
  down: number;
  /** Render tick of the latest event, and of the first. */
  last: number;
  born: number;
  /** Ground colour under the base, refreshed as it moves. */
  dust: number;
  /** Per-puff random params for the wall cloud. */
  p: Float32Array;
}

export function makeFunnel(seed: number, t: number): Funnel {
  const rng = new FxRng(seed);
  const p = new Float32Array(N_CLOUD * 4);
  for (let i = 0; i < p.length; i++) p[i] = rng.next();
  return {
    x: 0,
    y: 0,
    h: 100,
    base: 4,
    top: 30,
    lean: 0,
    wobble: 0,
    age: 0,
    strength: 0,
    down: 0,
    last: t,
    born: t,
    dust: 0x8a7458,
    p,
  };
}

/** Funnel half-width at height `hh` (matches the sim's quadratic flare; thins as it ropes out). */
export function funnelWidth(f: Funnel, hh: number): number {
  const k = Math.max(0, Math.min(1, hh / f.h));
  const full = f.base + (f.top - f.base) * k * k;
  return Math.max(1, full * Math.max(f.strength, 1 / 3));
}

/** Funnel centre column at height `hh` above the base (same lean and wobble as the sim). */
export function funnelCentre(f: Funnel, hh: number, age = f.age): number {
  const k = Math.max(0, Math.min(1, hh / f.h));
  const deg = (age * 25 + Math.min(f.h, Math.max(0, hh)) * 25) / 10;
  return f.x + f.lean * k + Math.sin((deg * Math.PI) / 180) * f.wobble * k;
}

/** Draw one tornado at render time `t` (fractional ticks between snapshots are fine). */
export function drawFunnel(f: Funnel, normal: QuadBatch, additive: QuadBatch, t: number): void {
  const age = f.age + Math.max(0, t - f.last);
  const H = f.h;
  const topY = f.y - H;
  const p = f.p;
  // fade in as the cloud gathers, fade out after the last event
  const gather = Math.min(1, (t - f.born) / 18);
  const gone = Math.max(0, Math.min(1, 1 - (t - f.last - 1) / 10));
  const vis = gather * gone;
  if (vis <= 0) return;

  // ── wall cloud: a flattened, slowly turning disc of storm puffs above the funnel
  const cw = f.top * 3.2 + 40;
  const ch = 14 + f.top * 0.35;
  const cy = topY - ch * 0.4;
  const spin = age * 0.03;
  for (let i = 0; i < N_CLOUD; i++) {
    const q = i * 4;
    const a = p[q]! * Math.PI * 2 + spin * (0.6 + 0.8 * p[q + 3]!);
    // inner puffs ride lower and turn faster: a rotating wall cloud over a flat anvil
    const rr = 0.15 + 0.85 * p[q + 1]!;
    const px = f.x + f.lean + Math.cos(a) * cw * rr;
    const py = cy + Math.sin(a) * ch * 0.45 * rr + (1 - rr) * ch * 0.5 - p[q + 2]! * ch * 0.5;
    const size = (10 + 14 * p[q + 2]!) * (1.2 - 0.45 * rr) * (0.5 + 0.5 * gather);
    // the near, lower side is lit by the ground glow less: darker underneath, lighter on top
    const shadeIx = Math.min(
      CLOUD.length - 1,
      Math.max(0, Math.floor(2.4 - Math.sin(a) * 1.4 - p[q + 2]! * 1.6 + (1 - rr) * 1.2)),
    );
    normal.push(
      Math.round(px),
      Math.round(py),
      size,
      size * 0.75,
      CLOUD[shadeIx]!,
      0.95 * vis,
      Shape.Solid,
    );
  }

  // ── funnel: comes down out of the cloud, then rows of wind bands spin round it
  const reach = H * f.down;
  const body = 0x6e6a78;
  const dusty = shade(f.dust, 1.05);
  const wspin = age * 0.32;
  for (let hh = 0; hh <= H; hh++) {
    if (H - hh > reach) continue;
    const row = f.y - hh;
    const w = funnelWidth(f, hh);
    const cx = funnelCentre(f, hh, age);
    const k = hh / H;
    // dust-coloured near the ground, storm-grey higher up; hard step, no gradient
    const col = k < 0.22 ? dusty : body;
    const x0 = Math.round(cx - w);
    const x1 = Math.round(cx + w);
    const width = x1 - x0 + 1;
    // translucent core band and harder edges
    normal.push(x0 + width / 2, row + 0.5, width, 1, col, (0.5 + 0.2 * (1 - k)) * vis);
    normal.push(x0 + 0.5, row + 0.5, 1, 1, shade(col, 0.7), 0.75 * vis);
    normal.push(x1 + 0.5, row + 0.5, 1, 1, shade(col, 0.7), 0.75 * vis);
    // three wind bands per row, twisting with height
    for (let b = 0; b < 3; b++) {
      const a = wspin + b * 2.0944 - hh * 0.11;
      const sx = Math.round(cx + Math.cos(a) * w);
      const front = Math.sin(a) > 0;
      const len = 1 + Math.round(Math.abs(Math.sin(a)) * Math.min(4, w * 0.35));
      if (front) normal.push(sx + 0.5, row + 0.5, len, 1, shade(col, 1.3), 0.9 * vis);
      else normal.push(sx + 0.5, row + 0.5, len, 1, shade(col, 0.6), 0.6 * vis);
    }
  }
  // the lowest few rows: a bright dust churn where it rips the ground up
  if (f.down >= 1 && f.strength > 0.05) {
    for (let i = 0; i < 6; i++) {
      const a = wspin * 1.3 + i * 1.047;
      const w = funnelWidth(f, 0) * 2.2 + 3;
      additive.push(
        Math.round(f.x + Math.cos(a) * w) + 0.5,
        f.y - 1 - Math.round(Math.abs(Math.sin(a)) * 3) + 0.5,
        2,
        1,
        shade(f.dust, 1.4),
        0.35 * f.strength * vis,
      );
    }
  }
}

import type { QuadBatch } from './batch';
import { KAIJU_EMBERS, KAIJU_FRAMES, KAIJU_PALETTE } from './kaiju-sprite';

/**
 * Pixel-art Kaiju (render-only, §2a) for the sim's per-tick `kaiju` effect events: a towering
 * mud monster drawn from four hand-cleaned pose frames (idle, roar, reach low, arms overhead;
 * see kaiju-sprite.ts), one map cell per sprite pixel. The pose follows the sim's state and
 * timer: it claws up out of the ground shaking (rows at or below the surface are never drawn),
 * roars, breathes, reaches in for a tank, hauls it overhead, hurls it and follows through, and
 * sinks back roaring when its time is up. The embers in its back plates and its eyes pulse in hard
 * palette steps. Everything is snapped to cells, no glow, and the look is a pure function of the
 * latest event and the render tick, so captures replay exactly.
 */

export interface KaijuFx {
  x: number;
  /** Ground row under its feet. */
  y: number;
  /** Standing height, cells (the sim's reach is sized to it; the sprite has its own size). */
  h: number;
  state: number;
  /** Ticks in the current state, and the rise / sink lengths. */
  t: number;
  rise: number;
  sink: number;
  /** Ticks it takes to topple over once dug out (then it bursts). */
  topple: number;
  /** Ticks its claw takes to drag a grabbed tank in (then it lifts it overhead). */
  reach: number;
  face: number;
  /** Where its working hand is, map cells. */
  hx: number;
  hy: number;
  held: number;
  /** Turns it has left, and sim age. */
  left: number;
  age: number;
  /** Render tick of the latest event. */
  last: number;
}

// sim states (terrainop.kaiju)
const RISE = 0;
const IDLE = 1;
const GRAB = 2;
const RECOVER = 3;
const TOSS = 4;
const RIP = 5;
const SINK = 6;
const TOPPLE = 7;
export const KAIJU_STATES = { RISE, IDLE, GRAB, RECOVER, TOSS, RIP, SINK, TOPPLE } as const;

const IDLE_F = 0;
const ROAR_F = 1;
const REACH_F = 2;
const UP_F = 3;

/** Ember ramp the glowing palette entries step through. */
const GLOW = [0x7a1808, 0xa1200c, 0xe95d08, 0xf8c409, 0xfff0a0] as const;

interface Frame {
  w: number;
  h: number;
  anchor: number;
  /** Palette index per cell, -1 transparent. */
  px: Int8Array;
}

let decoded: Frame[] | null = null;

function decode(): Frame[] {
  if (decoded) return decoded;
  decoded = KAIJU_FRAMES.map((f) => {
    const rows = f.rle.split('/');
    const cells: number[][] = rows.map((row) => {
      const out: number[] = [];
      let n = 0;
      for (const ch of row) {
        if (ch >= '0' && ch <= '9') {
          n = n * 10 + (ch.charCodeAt(0) - 48);
          continue;
        }
        const v = ch === '.' ? -1 : ch <= 'Z' ? ch.charCodeAt(0) - 65 : ch.charCodeAt(0) - 97 + 26;
        for (let k = 0; k < Math.max(1, n); k++) out.push(v);
        n = 0;
      }
      return out;
    });
    const h = cells.length;
    const w = Math.max(...cells.map((r) => r.length));
    const px = new Int8Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) {
      const r = cells[y]!;
      for (let x = 0; x < r.length; x++) px[y * w + x] = r[x]!;
    }
    return { w, h, anchor: f.anchor, px };
  });
  return decoded;
}

/** Which pose to show now. */
function frameOf(k: KaijuFx): number {
  const tm = k.t;
  switch (k.state) {
    case RISE:
      // claws its way up roaring, the last stretch with its arms up
      return tm > k.rise * 0.8 ? UP_F : ROAR_F;
    case IDLE:
      return tm < 40 && k.age < k.rise + 50 ? ROAR_F : IDLE_F;
    case GRAB:
      // reach in for the tank, then haul it up overhead
      return tm <= k.reach ? REACH_F : UP_F;
    case TOSS:
      // the catching hand swings up from where it snatched the shell
      return tm < 8 ? REACH_F : UP_F;
    case RECOVER:
      // the throw's follow-through, then upright again
      return tm < 7 ? REACH_F : IDLE_F;
    case RIP:
      return (tm >> 2) & 1 ? REACH_F : UP_F;
    case SINK:
    case TOPPLE:
      return ROAR_F;
    default:
      return IDLE_F;
  }
}

/** The palette for this tick: embers and eyes step along the glow ramp. */
function paletteAt(t: number, hot: boolean): number[] {
  const pal = KAIJU_PALETTE.slice();
  const step = (t >> 2) % 4;
  for (let i = 0; i < KAIJU_EMBERS.length; i++) {
    const e = KAIJU_EMBERS[i]!;
    const g = Math.min(
      GLOW.length - 1,
      Math.max(0, i + (step === 3 ? -1 : step === 1 ? 1 : 0) + (hot ? 1 : 0)),
    );
    pal[e] = GLOW[g]!;
  }
  return pal;
}

/**
 * How far out of the ground it is (0..1). The first third of the rise is the quake before the
 * ground bursts open: nothing shows yet.
 */
export function kaijuEmerged(k: KaijuFx): number {
  if (k.state === RISE) {
    const burst = Math.trunc(k.rise / 3);
    return Math.max(0, Math.min(1, (k.t - burst) / Math.max(1, k.rise - burst)));
  }
  if (k.state === SINK) return Math.max(0, 1 - k.t / Math.max(1, k.sink));
  return 1;
}

type Ground = { material(x: number, y: number): number };

/**
 * The angle it has keeled over to (radians, towards where it faces) and whether its body has hit
 * the ground yet. It staggers back a moment, then goes over faster and faster about its feet until
 * its spine meets solid ground (or lies flat), then bounces once off it.
 */
export function toppleAngle(
  k: KaijuFx,
  ground0: Ground,
): { angle: number; landed: boolean; since: number; tipX: number; tipY: number } {
  const f = k.face >= 0 ? 1 : -1;
  const feetY = Math.round(k.y);
  const px = Math.round(k.x);
  // the first angle (3 degree steps) where its upper body meets the ground
  let stop = Math.PI / 2;
  for (let deg = 6; deg <= 90; deg += 3) {
    const a = (deg * Math.PI) / 180;
    const sn = Math.sin(a);
    const cs = Math.cos(a);
    let hit = false;
    // its shoulders and head (a pit wall by its feet doesn't stop it: it falls over that)
    for (let hh = Math.round(k.h * 0.75); hh <= k.h && !hit; hh += 4) {
      if (ground0.material(px + Math.round(f * hh * sn), Math.round(feetY - hh * cs)) !== 0) {
        hit = true;
      }
    }
    if (hit) {
      stop = Math.max(0.2, a - 0.05);
      break;
    }
  }
  const T = Math.max(1, k.topple);
  const t = k.t;
  const stagger = Math.round(T * 0.2);
  const tip = (a: number): [number, number] => [
    px + Math.round(f * k.h * 0.7 * Math.sin(a)),
    Math.round(feetY - k.h * 0.7 * Math.cos(a)),
  ];
  if (t < stagger) {
    const a = -0.09 * Math.sin((t / stagger) * Math.PI);
    const [tipX, tipY] = tip(a);
    return { angle: a, landed: false, since: 0, tipX, tipY };
  }
  // falling: accelerates like a felled tree (angle ~ time squared) and lands at 70% of the time
  const fallT = Math.max(1, Math.round(T * 0.5));
  const ft = t - stagger;
  if (ft < fallT) {
    const a = stop * (ft / fallT) ** 2;
    const [tipX, tipY] = tip(a);
    return { angle: a, landed: false, since: 0, tipX, tipY };
  }
  // one bounce off the ground, settling back down
  const bt = ft - fallT;
  const bounce = Math.max(0, 0.12 * Math.sin((bt / 8) * Math.PI) * (bt < 8 ? 1 : 0.35));
  const [tipX, tipY] = tip(stop);
  return { angle: stop - bounce, landed: true, since: bt, tipX, tipY };
}

const ROT_MAX = 300;
const rotBuf = new Int8Array(ROT_MAX * ROT_MAX);

/**
 * Dug out: it keels over about its feet towards where it faces. The pose turns by three shears
 * (each cell moves to exactly one cell, so the art stays crisp: no holes, no doubled pixels), and
 * it is drawn in front of the terrain, hidden only below the row its feet stand on.
 */
function drawToppling(
  k: KaijuFx,
  fr: Frame,
  pal: number[],
  normal: QuadBatch,
  ground0: Ground,
): void {
  const f = k.face >= 0 ? 1 : -1;
  const feetY = Math.round(k.y);
  const px = Math.round(k.x);
  const { angle, landed, since } = toppleAngle(k, ground0);
  const phi = f * angle;
  const sh = -Math.tan(phi / 2);
  const sn = Math.sin(phi);
  const half = ROT_MAX >> 1;
  rotBuf.fill(-1);
  // a thud: one cell down for a couple of ticks as it lands
  const thud = landed && since < 3 ? 1 : 0;
  for (let cy = 0; cy < fr.h; cy++) {
    const Y = cy - (fr.h - 1);
    for (let cx = 0; cx < fr.w; cx++) {
      const v = fr.px[cy * fr.w + cx]!;
      if (v < 0) continue;
      const X = f * (cx - fr.anchor);
      const x1 = X + Math.round(sh * Y);
      const y1 = Y + Math.round(sn * x1);
      const x2 = x1 + Math.round(sh * y1);
      const bx = x2 + half;
      const by = y1 + half;
      if (bx < 0 || by < 0 || bx >= ROT_MAX || by >= ROT_MAX) continue;
      rotBuf[by * ROT_MAX + bx] = v;
    }
  }
  for (let by = 0; by < ROT_MAX; by++) {
    const rowY = feetY + by - half + thud;
    const row = by * ROT_MAX;
    let run = -1;
    let start = 0;
    for (let bx = 0; bx <= ROT_MAX; bx++) {
      let v = bx < ROT_MAX ? rotBuf[row + bx]! : -1;
      if (v >= 0 && rowY > feetY && ground0.material(px + bx - half, rowY) !== 0) v = -1;
      if (v === run && bx < ROT_MAX) continue;
      if (run >= 0) normal.rect(px + start - half, rowY, bx - start, 1, pal[run]!);
      run = v;
      start = bx;
    }
  }
}

/** Draw one kaiju. */
export function drawKaiju(
  k: KaijuFx,
  normal: QuadBatch,
  additive: QuadBatch,
  t: number,
  /** Terrain: cells inside solid ground are never drawn (it climbs out through the real surface). */
  ground0: { material(x: number, y: number): number },
): void {
  const frames = decode();
  const fr = frames[frameOf(k)]!;
  const f = k.face >= 0 ? 1 : -1;
  const ground = Math.round(k.y);
  const up = kaijuEmerged(k);
  if (up <= 0) return;
  // it heaves up (or sinks) in two-cell steps, not a smooth slide
  const drop = Math.round(((1 - up) * (fr.h + 6)) / 2) * 2;
  // tremble while it heaves, rips or slams
  const shaking = k.state === RISE || k.state === SINK || k.state === RIP;
  const shake = shaking && ((t >> 1) & 1) === 1 ? f : 0;
  const x = Math.round(k.x) + shake;
  const top = ground - fr.h + drop;
  // breathing: the upper body rises a cell every other half-second (one row stretched at the
  // waist); a pose change lands with a one-row squash
  const waist = Math.round(fr.h * 0.55);
  const breathe = k.state === IDLE && ((k.age >> 5) & 1) === 1 ? 1 : 0;
  const squash =
    (k.state === RECOVER && k.t < 3) || (k.state === GRAB && k.t > k.reach && k.t <= k.reach + 3);
  const lift = breathe - (squash ? 1 : 0);
  const hot = k.state === GRAB || k.state === TOSS || k.state === RIP || frameOf(k) === ROAR_F;
  const pal = paletteAt(t, hot);
  // climbing out or sinking back it is hidden wherever the ground is; standing, only round its
  // feet (a pit dug beside it doesn't slice its arms off)
  const clipAll = k.state === RISE || k.state === SINK;
  if (k.state === TOPPLE) {
    drawToppling(k, fr, pal, normal, ground0);
    return;
  }

  for (let y = 0; y < fr.h; y++) {
    // rows above the waist shift up by `lift`; the waist row fills any gap
    const shifted = y < waist ? -lift : 0;
    const row = top + y + shifted;
    if (row >= ground) break;
    const reps = y === waist && lift > 0 ? lift + 1 : 1;
    for (let rr = 0; rr < reps; rr++) {
      const rowY = row - rr;
      if (rowY >= ground) continue;
      let run = -1;
      let start = 0;
      for (let cx = 0; cx <= fr.w; cx++) {
        let v = cx < fr.w ? fr.px[y * fr.w + cx]! : -1;
        // hidden inside the ground: it shows only where there is air (so it climbs out of the
        // real surface, a crater included, and a hill in front of it hides its feet)
        if (
          v >= 0 &&
          (clipAll || rowY >= ground - 8) &&
          ground0.material(x + f * (cx - fr.anchor), rowY) !== 0
        ) {
          v = -1;
        }
        if (v === run && cx < fr.w) continue;
        if (run >= 0) {
          const a = x + f * (start - fr.anchor);
          const c = x + f * (cx - 1 - fr.anchor);
          normal.rect(Math.min(a, c), rowY, Math.abs(c - a) + 1, 1, pal[run]!);
        }
        run = v;
        start = cx;
      }
    }
  }

  // shells in hand glow in hard steps, ready to be hurled
  if (k.held > 0) {
    const hx = Math.round(k.hx);
    const hy = Math.round(k.hy) + drop;
    const c = (t >> 2) & 1 ? GLOW[4] : GLOW[3];
    normal.rect(hx - 2, hy - 2, 5, 5, GLOW[2]);
    normal.rect(hx - 1, hy - 1, 3, 3, c);
    additive.rect(hx - 4, hy - 4, 9, 9, GLOW[1], 0.3);
  }
}

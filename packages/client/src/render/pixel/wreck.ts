import type { QuadBatch } from './batch';
import { FxRng } from './gl';
import { PKind, type ParticleSink } from './particles';
import { shade } from './theme';

/**
 * A tank's death sequence (render-only, §2a), started by the sim's `tankDeath` event: the turret
 * is blown off and tumbles through the air trailing smoke, bounces and comes to rest on the
 * ground; the hull is left as a charred wreck that burns for a few seconds; and the ammunition
 * inside cooks off in a string of smaller blasts. Everything is cosmetic (the sim's single death
 * explosion is the only damage), snapped to map cells, and seeded from the event, so captures
 * replay exactly. `COOK_OFF` is mirrored by the delays in `audio.tank-cookoff`.
 */

/** Ticks after the death when the ammunition cooks off; the last one is the biggest. */
export const COOK_OFF = [34, 72, 118, 168] as const;
/** Ticks the hull burns with open flame; it smoulders (a few blinking embers) for as long again. */
export const BURN_TICKS = 420;
/** Ticks the blown-off turret takes to char from the player's colour to soot. */
const CHAR_TICKS = 150;
const TURRET_GRAVITY = 0.14;
/** Char tones for the wreck: soot, dark and lit metal. */
const CHAR = [0x1d191b, 0x2a2426, 0x3a3034] as const;
/** Hot metal, hottest first, in hard bands. */
const HOT = [0xfff0a0, 0xffa020, 0xe04a10, 0x8a2a10] as const;

/** One cell of a sprite piece: offset from the piece's pivot and its colour. */
interface Cell {
  dx: number;
  dy: number;
  rgb: number;
}

export interface Wreck {
  player: number;
  start: number;
  /** Hull cells relative to (tank x, ground row). */
  hull: Cell[];
  /** Hull width in cells, for flames and cook-off positions. */
  w: number;
  /** Hull height in cells. */
  h: number;
  /** Turret (and barrel) colours on a square grid of side `2 * reach + 1` around its pivot; -1 = empty. */
  turret: Int32Array;
  reach: number;
  /** Turret centre, velocity, spin (radians) and spin rate; `rest` once it has settled. */
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  spin: number;
  rate: number;
  /** Lowest turret cell below its centre, in cells (what it lands on). */
  foot: number;
  rest: boolean;
  /** Fell off the map: no longer drawn. */
  gone: boolean;
  rng: FxRng;
}

/** Where a cook-off goes off: relative to the hull's base, and how big it is. */
export interface CookOff {
  x: number;
  y: number;
  radius: number;
  big: boolean;
}

export interface SpriteLook {
  sprite: readonly string[];
  barrel: { x: number; y: number; length: number; width: number };
}

/**
 * Split a tank sprite into turret and hull: the turret is the narrow rows on top, down to the
 * first row that fills at least three quarters of the sprite's width.
 */
export function turretRows(sprite: readonly string[]): number {
  const sw = sprite[0]?.length ?? 0;
  for (let r = 0; r < sprite.length; r++) {
    let n = 0;
    const row = sprite[r]!;
    for (let c = 0; c < row.length; c++) if (row.charCodeAt(c) !== 46) n++;
    if (n * 4 >= sw * 3) return r;
  }
  return 0;
}

export function makeWreck(
  look: SpriteLook,
  colorOf: (code: number) => number,
  player: number,
  x: number,
  y: number,
  angle: number,
  start: number,
): Wreck {
  const rows = look.sprite;
  const sw = rows[0]?.length ?? 0;
  const sh = rows.length;
  const split = turretRows(rows);
  const hull: Cell[] = [];
  const top: Cell[] = [];
  for (let r = 0; r < sh; r++) {
    const row = rows[r]!;
    for (let c = 0; c < sw; c++) {
      const code = row.charCodeAt(c);
      if (code === 46) continue;
      const cell = { dx: c - (sw >> 1), dy: r - sh, rgb: colorOf(code) };
      (r < split ? top : hull).push(cell);
    }
  }
  // the barrel goes with the turret, still pointing where it last aimed
  const br = look.barrel;
  const a = (angle * Math.PI) / 180;
  const off = br.width >> 1;
  for (let i = 1; i <= br.length; i++) {
    const cx = Math.round(br.x + Math.cos(a) * i);
    const cy = Math.round(-br.y - Math.sin(a) * i);
    for (let u = 0; u < br.width; u++)
      for (let v = 0; v < br.width; v++)
        top.push({
          dx: cx - off + u,
          dy: cy - off + v,
          rgb: i === br.length ? 0xa8a298 : 0xd8d2c8,
        });
  }
  // pivot on the turret body's centre (not the barrel's), so it tumbles about its weight
  let mx = 0;
  let my = 0;
  let nBody = 0;
  for (let r = 0; r < split; r++) {
    const row = rows[r]!;
    for (let c = 0; c < sw; c++) {
      if (row.charCodeAt(c) === 46) continue;
      mx += c - (sw >> 1);
      my += r - sh;
      nBody++;
    }
  }
  const px = nBody > 0 ? Math.round(mx / nBody) : 0;
  const py = nBody > 0 ? Math.round(my / nBody) : -sh;
  let reach = 0;
  for (const c of top) reach = Math.max(reach, Math.abs(c.dx - px), Math.abs(c.dy - py));
  const side0 = 2 * reach + 1;
  const turret = new Int32Array(side0 * side0).fill(-1);
  for (const c of top) turret[(c.dy - py + reach) * side0 + c.dx - px + reach] = c.rgb;
  // what it lands on: the body's half-height (the barrel may poke into the dirt)
  const foot = Math.max(1, Math.min(3, Math.ceil(split / 2)));
  const rng = new FxRng(Math.imul(start + 1, 2654435761) ^ Math.imul(player + 11, 40503) ^ x);
  // blown up and away from the barrel side, spinning hard
  const side = Math.cos(a) >= 0 ? -1 : 1;
  const flip = rng.next() < 0.25 ? -side : side;
  return {
    player,
    start,
    hull,
    w: sw,
    h: sh - split,
    turret,
    reach,
    tx: x + px,
    ty: y + py,
    vx: flip * rng.range(0.5, 1.3),
    vy: -rng.range(3.2, 4.2),
    spin: 0,
    rate: flip * rng.range(0.18, 0.32),
    foot,
    rest: false,
    gone: false,
    rng,
  };
}

export type Solid = (x: number, y: number) => boolean;

/**
 * One tick of a wreck at tick `t`: the turret flies, bounces and settles (and drops again if the
 * ground under it is blown away); the hull burns. `hullY` is the row the wreck stands on now.
 * Returns the cook-off due this tick, if any (the caller turns it into a blast).
 */
export function stepWreck(
  w: Wreck,
  t: number,
  hullX: number,
  hullY: number,
  solid: Solid,
  particles: ParticleSink,
  mult: number,
  height: number,
): CookOff | undefined {
  const age = t - w.start;
  if (!w.gone) stepTurret(w, age, solid, particles, height);
  // the hull burns: flames licking up off its deck, thinning out as the fire dies down
  if (age >= 0 && age < BURN_TICKS) {
    const k = age / BURN_TICKS;
    const rate = (1 - k) * (1 - k) * 1.6 * mult + 0.15;
    let n = Math.floor(rate);
    if (w.rng.next() < rate - n) n++;
    for (let i = 0; i < n; i++) {
      const fx = hullX + Math.round(w.rng.range(-0.45, 0.45) * w.w);
      particles.add({
        x: fx + 0.5,
        y: hullY - w.h - w.rng.range(0, 1.5),
        vx: w.rng.range(-0.12, 0.12),
        vy: -w.rng.range(0.25, 0.6),
        life: w.rng.range(16, 32) * (1 - k * 0.5),
        size: w.rng.range(1.5, 3.2) * (1 - k * 0.4),
        color: 0,
        kind: PKind.Flame,
      });
    }
    // thick black smoke over the fire
    if (age % 5 === 0) {
      particles.add({
        x: hullX + w.rng.range(-3, 3),
        y: hullY - w.h - 4,
        vx: 0,
        vy: -w.rng.range(0.25, 0.45),
        life: w.rng.range(80, 120),
        size: w.rng.range(4, 6) * (1 - k * 0.5),
        color: w.rng.next() < 0.5 ? 0x1e1a1c : 0x2e282a,
        kind: PKind.Smoke,
      });
    }
  }
  const i = COOK_OFF.indexOf(age as (typeof COOK_OFF)[number]);
  if (i < 0) return undefined;
  const big = i === COOK_OFF.length - 1;
  return {
    x: hullX + Math.round(w.rng.range(-0.35, 0.35) * w.w),
    y: hullY - w.h + 1,
    radius: big ? 9 : 5 + i,
    big,
  };
}

function stepTurret(
  w: Wreck,
  age: number,
  solid: Solid,
  particles: ParticleSink,
  height: number,
): void {
  if (age < 0) return;
  const below = (x: number, y: number) => solid(Math.round(x), Math.round(y) + w.foot + 1);
  if (w.rest) {
    // the ground went out from under it: fall again
    if (!below(w.tx, w.ty)) w.rest = false;
    else return;
  }
  w.vy = Math.min(w.vy + TURRET_GRAVITY, 5);
  // move in sub-steps of at most one cell so it can't tunnel through a thin ledge
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(w.vx), Math.abs(w.vy))));
  for (let s = 0; s < steps; s++) {
    const nx = w.tx + w.vx / steps;
    if (solid(Math.round(nx) + Math.sign(w.vx) * w.foot, Math.round(w.ty))) {
      w.vx = -w.vx * 0.4; // glanced off a wall
    } else {
      w.tx = nx;
    }
    const ny = w.ty + w.vy / steps;
    if (w.vy > 0 && below(w.tx, ny)) {
      // landed: bounce, losing most of its speed and spin, until it lies still
      w.ty = Math.round(ny);
      while (below(w.tx, w.ty - 1) && w.ty > 0) w.ty--;
      if (w.vy < 1.2) {
        w.rest = true;
        w.vx = 0;
        w.vy = 0;
        // lies flat: upright or on its back, whichever it is closer to
        const turns = Math.round(w.spin / Math.PI);
        w.spin = turns * Math.PI;
        w.rate = 0;
        return;
      }
      w.vy = -w.vy * 0.35;
      w.vx *= 0.6;
      w.rate *= 0.5;
      for (let i = 0; i < 4; i++) {
        particles.add({
          x: w.tx,
          y: w.ty + w.foot,
          vx: w.rng.range(-0.8, 0.8),
          vy: -w.rng.range(0.4, 1.2),
          life: w.rng.range(10, 22),
          size: 1,
          color: w.rng.next() < 0.4 ? 0xfff0a0 : 0xff7a1a,
          kind: PKind.Spark,
        });
      }
      break;
    }
    if (w.vy < 0 && solid(Math.round(w.tx), Math.round(ny) - w.foot)) {
      w.vy = 0; // hit a ceiling
    } else {
      w.ty = ny;
    }
  }
  w.spin += w.rate;
  if (w.ty > height + 16) w.gone = true;
  // a smoke trail behind it, and sparks shed from the torn ring while it is still hot
  if (age % 2 === 0) {
    particles.add({
      x: w.tx,
      y: w.ty,
      vx: 0,
      vy: -0.08,
      life: 50,
      size: 2 + (age % 4 === 0 ? 1 : 0),
      color: 0x2e282a,
      kind: PKind.Smoke,
    });
  }
  if (age < 50) {
    particles.add({
      x: w.tx + w.rng.range(-1, 1),
      y: w.ty + w.rng.range(-1, 1),
      vx: w.rng.range(-0.4, 0.4),
      vy: w.rng.range(-0.2, 0.4),
      life: w.rng.range(8, 16),
      size: 1,
      color: w.rng.next() < 0.5 ? 0xfff0a0 : 0xffa020,
      kind: PKind.Spark,
    });
  }
}

/** A cheap per-cell hash for flicker, stable within a 4-tick step. */
function cellHash(x: number, y: number, t: number): number {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(t + 1, 83492791);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Draw the hull at its resting place: charred metal in hard bands, hot cells flickering on its
 * deck while it burns, then a few slow embers while it smoulders.
 */
export function drawHull(b: QuadBatch, w: Wreck, x: number, y: number, t: number): void {
  const age = Math.max(0, t - w.start);
  const heat = age < BURN_TICKS ? 1 - age / BURN_TICKS : 0;
  const smoulder = age < BURN_TICKS * 2 ? 1 - age / (BURN_TICKS * 2) : 0;
  const step = Math.floor(t / 4);
  for (const c of w.hull) {
    const cx = x + c.dx;
    const cy = y + c.dy;
    const h = cellHash(cx, cy, step);
    // charred: mostly soot, the old paint showing through faintly on the lit rows
    const depth = c.dy + w.h; // 0 at the deck
    let rgb: number = CHAR[(h >>> 8) % 3]!;
    if (depth >= 1 && depth <= 2 && ((h >>> 12) & 7) === 0) rgb = shade(c.rgb, 0.35);
    const p = (h & 255) / 255;
    if (heat > 0 && depth <= 2 && p < 0.35 * heat)
      rgb = HOT[Math.min(3, Math.floor((1 - heat) * 3 + p * 4))]!;
    else if (smoulder > 0 && p < 0.06 * smoulder) rgb = HOT[3]!;
    b.rect(cx, cy, 1, 1, rgb);
  }
}

/**
 * Draw the blown-off turret, charring as it cools: rotated by sampling the sprite back from each
 * destination cell (nearest cell), so it stays solid with no holes at any angle.
 */
export function drawTurret(b: QuadBatch, w: Wreck, t: number): void {
  if (w.gone) return;
  const age = t - w.start;
  if (age < 0) return;
  const k = Math.min(1, age / CHAR_TICKS);
  // hard bands: paint, scorched, then soot like the hull with the odd fleck of paint left
  const band = k < 0.34 ? 0.85 : 0.5;
  const cs = Math.cos(w.spin);
  const sn = Math.sin(w.spin);
  const cx = Math.round(w.tx);
  const cy = Math.round(w.ty);
  const step = Math.floor(t / 4);
  const r = w.reach;
  const side = 2 * r + 1;
  // corners of the source square reach √2 × further once rotated
  const R = Math.ceil(r * 1.42);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const sx = Math.round(dx * cs + dy * sn);
      const sy = Math.round(-dx * sn + dy * cs);
      if (sx < -r || sx > r || sy < -r || sy > r) continue;
      const src = w.turret[(sy + r) * side + sx + r]!;
      if (src < 0) continue;
      const x = cx + dx;
      const y = cy + dy;
      const h = cellHash(dx, dy, w.player);
      let rgb: number =
        k < 0.67 || (h & 7) === 0 ? shade(src, k < 0.67 ? band : 0.35) : CHAR[(h >>> 8) % 3]!;
      if (k < 1 && (cellHash(x, y, step) & 255) < 50 * (1 - k)) rgb = HOT[1 + (step & 1)]!;
      b.rect(x, y, 1, 1, rgb);
    }
  }
}

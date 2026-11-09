import { Shape, type QuadBatch } from './batch';

/**
 * Pixel-art gravity objects (render-only, §2a) for the sim's per-tick events: the Gravity Well
 * (`gravityWell`). A black core rimmed by a hard white/violet photon ring, a tilted accretion disc
 * of single cells orbiting it (faster further in, stepping hot white → orange → magenta → violet
 * in hard bands), specks of dust spiralling in from the rim of its field, and a sparse dotted ring
 * marking how far the field reaches. Everything sits on whole map cells, no smooth glow, and the
 * look is a pure function of the event stream and the render tick, so captures replay exactly.
 */

export interface GravityFx {
  x: number;
  y: number;
  /** Field reach and core radius, cells. */
  r: number;
  core: number;
  /** 0..1 strength (opening/closing). */
  strength: number;
  /** Sim age of the latest event, and the render tick it came in. */
  age: number;
  last: number;
}

export interface SolidProbe {
  material(x: number, y: number): number;
}

const DISC = [0xffffff, 0xffe8a0, 0xffa040, 0xe0508a, 0x9a48e0, 0x5a38b0] as const;
const DUST = [0xd8c0ff, 0x9070e0, 0x5040a0] as const;
const RING_IN = 0xffffff;
const RING_OUT = 0xb070ff;
const HOLE = 0x05030a;

function px(b: QuadBatch, x: number, y: number, color: number, alpha = 1): void {
  b.push(Math.round(x) + 0.5, Math.round(y) + 0.5, 1, 1, color, alpha, Shape.Rect);
}

/** Integer hash for stable per-dot variety. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 13)) >>> 0;
}

/** A filled disc of whole cells. */
export function disc(b: QuadBatch, cx: number, cy: number, r: number, color: number): void {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r + r - dy * dy)));
    b.push(cx + 0.5, cy + dy + 0.5, 2 * w + 1, 1, color, 1, Shape.Rect);
  }
}

/** A one-cell ring, every cell (gaps where `skip` says so). */
export function ring(
  b: QuadBatch,
  cx: number,
  cy: number,
  r: number,
  color: number,
  alpha: number,
  skip?: (i: number) => boolean,
): void {
  const n = Math.max(8, Math.round(r * 6.3));
  let lx = 1e9;
  let ly = 1e9;
  for (let i = 0; i < n; i++) {
    if (skip?.(i)) continue;
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (x === lx && y === ly) continue;
    lx = x;
    ly = y;
    px(b, x, y, color, alpha);
  }
}

/**
 * The accretion disc: `n` cells on tilted orbits between `r0` and `r1`, each orbit turning faster
 * the further in it is. Drawn before the core so the core hides the far side.
 */
export function accretion(
  normal: QuadBatch,
  additive: QuadBatch,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  n: number,
  time: number,
  s: number,
  seed: number,
  /** -1: only the far half (behind the core), 1: only the near half, 0: all of it. */
  half = 0,
): void {
  for (let i = 0; i < n; i++) {
    const h = hash(i, seed);
    const f = (h & 1023) / 1023;
    const r = r0 + (r1 - r0) * f * f;
    const w = 0.9 / Math.max(1, r) ** 1.1;
    const a = ((h >>> 10) / 4194304) * Math.PI * 2 + time * w * 6;
    const near = Math.sin(a) > 0;
    if ((half < 0 && near) || (half > 0 && !near)) continue;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.32 - Math.cos(a) * r * 0.08;
    // the near half never paints over the hole itself (it reads as specks on its face)
    if (half > 0 && (x - cx) ** 2 + (y - cy) ** 2 < (r0 - 1) ** 2) continue;
    const band = Math.min(DISC.length - 1, Math.floor(f * DISC.length));
    const col = DISC[band]!;
    px(normal, x, y, col, s);
    if (band < 2) px(additive, x, y, col, 0.6 * s);
  }
}

/** Draw one Gravity Well at render tick `t`. */
export function drawWell(
  w: GravityFx,
  normal: QuadBatch,
  additive: QuadBatch,
  t: number,
  probe: SolidProbe,
  /** A roaming hole: no field ring (its field is short), more disc, and the disc may cross ground. */
  rogue = false,
): void {
  const time = w.age + Math.max(0, t - w.last);
  const s = Math.max(0, Math.min(1, w.strength));
  if (s <= 0) return;
  const cx = Math.round(w.x);
  const cy = Math.round(w.y);
  const R = w.r;
  const core = Math.max(1, Math.round(w.core * s));

  // the field's reach: a sparse dotted ring turning slowly, only in the air
  const nRim = rogue ? 0 : Math.round(R * 2.2);
  for (let i = 0; i < nRim; i++) {
    if (i % 3 !== 0) continue;
    const a = (i / nRim) * Math.PI * 2 + time * 0.004;
    const x = Math.round(cx + Math.cos(a) * R);
    const y = Math.round(cy + Math.sin(a) * R);
    if (probe.material(x, y) !== 0) continue;
    px(normal, x, y, DUST[2], 0.35 * s);
  }

  // dust specks spiralling in from the rim, quicker and brighter as they fall
  const specks = 36;
  const period = 70;
  for (let i = 0; i < specks; i++) {
    const h = hash(i, 911);
    const ph = (time + (h % period)) % period;
    const k = ph / period;
    const r = core + 2 + (R - core - 2) * (1 - k) * (1 - k);
    const a = ((h >>> 8) / 16777216) * Math.PI * 2 + k * k * 9;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (probe.material(x, y) !== 0) continue;
    const col = DUST[k > 0.75 ? 0 : k > 0.4 ? 1 : 2]!;
    px(normal, x, y, col, s * (0.4 + 0.6 * k));
    // a short tail along the orbit
    if (k > 0.5) {
      const a2 = a - 0.25;
      const r2 = r + 1.5;
      px(normal, cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2, DUST[2], 0.6 * s);
    }
  }

  // the far half of the accretion disc, the photon ring, the hole, then the near half over it
  const flick = Math.floor(time / 3);
  accretion(normal, additive, cx, cy, core + 2, core + 22, 150, time, s, 17, -1);
  ring(normal, cx, cy, core + 3, DUST[1], 0.5 * s, (i) => hash(i, flick + 7) % 3 !== 0);
  ring(normal, cx, cy, core + 1, RING_OUT, s, (i) => hash(i, flick) % 5 === 0);
  ring(normal, cx, cy, core, RING_IN, s);
  ring(additive, cx, cy, core, RING_IN, 0.5 * s);
  disc(normal, cx, cy, core - 1, HOLE);
  accretion(normal, additive, cx, cy, core + 2, core + 22, 150, time, s, 17, 1);
}

/** A Supernova's star while it burns (`supernova` events). */
export interface StarFx {
  x: number;
  y: number;
  /** Pull reach, cells. */
  r: number;
  /** Sim tick of the burn, its full length, and the collapse at its end. */
  t: number;
  charge: number;
  collapse: number;
  last: number;
}

const STAR = [0xffffff, 0xfff2a0, 0xffc040, 0xff7020, 0xc8301c] as const;
const DEAD = [0xffffff, 0xc8f0ff, 0x70b8ff, 0x4060e0] as const;

/** Draw a Supernova's star at render tick `t`. */
export function drawStar(
  st: StarFx,
  normal: QuadBatch,
  additive: QuadBatch,
  t: number,
  probe: SolidProbe,
): void {
  const time = st.t + Math.max(0, t - st.last);
  if (time > st.charge) return;
  const burn = Math.max(1, st.charge - st.collapse);
  const cx = Math.round(st.x);
  const cy = Math.round(st.y);
  const k = Math.min(1, time / burn);
  const dying = time > burn;
  const c = dying ? Math.min(1, (time - burn) / Math.max(1, st.collapse)) : 0;
  const size = dying
    ? Math.max(1, Math.round((3 + 9 * k) * (1 - c) * (1 - c)))
    : Math.round(3 + 9 * k);

  // matter streaming in from all round, more and faster as it grows
  if (!dying) {
    const n = Math.round(20 + 60 * k);
    const period = Math.max(10, Math.round(40 - 18 * k));
    const reach = st.r * 0.75;
    for (let i = 0; i < n; i++) {
      const h = hash(i, 4231);
      const ph = (time + (h % period)) % period;
      const f = ph / period;
      const r = size + 2 + (reach - size - 2) * (1 - f) * (1 - f);
      const a = ((h >>> 8) / 16777216) * Math.PI * 2 + f * 1.2;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (probe.material(x, y) !== 0) continue;
      const col = f > 0.7 ? STAR[1] : f > 0.35 ? STAR[2] : STAR[3];
      px(normal, x, y, col, 0.5 + 0.5 * f);
      if (f > 0.5) {
        const r2 = r + 2;
        px(normal, cx + Math.cos(a - 0.05) * r2, cy + Math.sin(a - 0.05) * r2, STAR[3], 0.6);
      }
    }
  } else {
    // collapsing: a ring of light falls in on the point
    const rr = Math.max(size + 1, Math.round(st.r * 0.4 * (1 - c)));
    ring(normal, cx, cy, rr, DEAD[1], 1, (i) => hash(i, time) % 3 === 0);
    ring(additive, cx, cy, rr, DEAD[2], 0.6);
  }

  // corona: flickering prominences licking off the rim
  const pal = dying ? DEAD : STAR;
  const flick = Math.floor(time / 2);
  const tongues = 10 + Math.round(10 * k);
  for (let i = 0; i < tongues; i++) {
    const h = hash(i, flick);
    const a = ((h & 4095) / 4096) * Math.PI * 2;
    const len = 1 + ((h >>> 12) % Math.max(2, Math.round(2 + size * 0.5)));
    for (let j = 1; j <= len; j++) {
      const x = cx + Math.cos(a) * (size + j);
      const y = cy + Math.sin(a) * (size + j);
      px(normal, x, y, pal[Math.min(pal.length - 1, 2 + (j >> 1))]!, 1);
    }
  }
  // the star: hard concentric bands, a pulse rippling through them
  const pulse = (Math.floor(time / 4) & 1) === 0 ? 0 : 1;
  disc(normal, cx, cy, size, pal[pal.length - 1]!);
  if (size > 1) disc(normal, cx, cy, size - 1, pal[Math.max(1, pal.length - 2)]!);
  if (size > 3) disc(normal, cx, cy, Math.round(size * 0.66) - pulse, pal[2]!);
  if (size > 5) disc(normal, cx, cy, Math.round(size * 0.4), pal[1]!);
  disc(normal, cx, cy, Math.max(0, Math.round(size * 0.18)), pal[0]!);
  disc(additive, cx, cy, size + 2, pal[2]!);
}

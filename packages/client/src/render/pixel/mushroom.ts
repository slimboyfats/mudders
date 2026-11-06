import { Shape, type QuadBatch } from './batch';
import { FxRng } from './gl';

/**
 * Pixel-art mushroom cloud for nuke-class blasts (render-only, §2a): a fireball that climbs on a
 * rising stem and rolls out into a toroidal cap, cooling from white-hot through orange and red to
 * dark smoke in hard palette steps. Every puff is a cell-snapped pixel blob (hard bands + dither),
 * and its whole life is a pure function of (seed, age), so captures replay exactly.
 */

/** Hot-to-cold ramp, one hard step per entry (no smooth gradients). */
const RAMP = [
  0xfff8dc, 0xffe070, 0xffb030, 0xf07020, 0xc84418, 0x8a3420, 0x5e3a30, 0x4a3a3c, 0x3a3036,
] as const;

const N_CAP = 44;
const N_DOME = 22;
const N_STEM = 40;
const N_SKIRT = 16;
const N = N_CAP + N_DOME + N_STEM + N_SKIRT;

/** Ticks the cloud lives after the main blast; it keeps climbing slowly the whole time. */
export const MUSHROOM_AFTER = 240;

export interface Mushroom {
  x: number;
  /** Ground zero (map cells, y down). */
  y: number;
  r: number;
  start: number;
  /** Ticks from the cloud's start to the main blast (the pause the player watches). */
  fuse: number;
  /** Total ticks the cloud lives. */
  life: number;
  /** Highest the cap centre may climb (stays on screen). */
  top: number;
  /** Per-puff random params: phase, size jitter, heat jitter, spread. */
  p: Float32Array;
}

export function makeMushroom(
  x: number,
  y: number,
  r: number,
  start: number,
  seed: number,
  fuse = 0,
): Mushroom {
  const rng = new FxRng(seed);
  const p = new Float32Array(N * 4);
  for (let i = 0; i < p.length; i++) p[i] = rng.next();
  return { x, y, r, start, fuse, life: fuse + MUSHROOM_AFTER, top: Math.max(r * 0.55 + 6, 0), p };
}

const ease = (k: number) => 1 - (1 - k) * (1 - k);

function rampColor(heat: number): number {
  const i = Math.max(0, Math.min(RAMP.length - 1, Math.floor(heat)));
  return RAMP[i]!;
}

/** A shaded puff: dark underside blob plus a smaller lit blob nudged up-left (pixel-art shading). */
function puff(
  normal: QuadBatch,
  x: number,
  y: number,
  size: number,
  heat: number,
  alpha: number,
): void {
  if (size < 1 || alpha <= 0.02) return;
  normal.push(x, y, size, size, rampColor(heat + 1.4), alpha, Shape.Solid);
  const s = size * 0.7;
  normal.push(x - size * 0.11, y - size * 0.14, s, s, rampColor(heat), alpha, Shape.Solid);
}

/** Draw one mushroom cloud at render time `t`; returns false once it has fully faded. */
export function drawMushroom(
  m: Mushroom,
  normal: QuadBatch,
  additive: QuadBatch,
  t: number,
): boolean {
  const age = t - m.start;
  if (age < 0) return true;
  if (age > m.life) return false;
  const { x, y, r, p, life, fuse } = m;
  // one slow, steady climb over the whole life: never snaps up and hangs
  const rise = ease(Math.min(1, age / (life * 0.9)));
  // cap height: about 2.4 radii above ground zero, clamped to stay on the map
  const h = Math.min(r * 2.4, y - m.top) * (0.1 + 0.9 * rise);
  const capY = y - h;
  const capW = r * (0.3 + 0.8 * ease(Math.min(1, age / life)));
  const capH = capW * 0.42;
  // cooling: white-hot at first, smoke by the end; the main blast re-heats it for a moment
  const cool = Math.min(1, age / (life * 0.75));
  const since = age - fuse;
  const boom = since >= 0 && since < 50 ? (1 - since / 50) * 3 : 0;
  const baseHeat = 0.2 + cool * 6.4 - boom;
  const fade = age < life - 70 ? 1 : (life - age) / 70;
  const drift = age * 0.02; // the whole cloud leans gently with the hang time
  const roll = age * 0.035;

  // stem: puffs rising up the column, narrow waist, flared base
  // the stem roots down in the crater, below ground zero
  const ground = y + r * 0.45;
  const stemTop = capY + capH * 0.6;
  const stemLen = Math.max(0, ground - stemTop);
  for (let i = 0; i < N_STEM; i++) {
    const q = (N_CAP + N_DOME + i) * 4;
    const f = (p[q]! + age * 0.012) % 1; // 0 = ground, 1 = cap
    const waist = 1 - 0.45 * Math.sin(Math.PI * Math.min(1, f * 1.15));
    const w = r * 0.26 * waist * (0.8 + 0.4 * p[q + 1]!);
    const px = x + (p[q + 3]! - 0.5) * w * 1.2 + drift * f;
    const py = ground - f * stemLen;
    const size = Math.max(3, w * 1.7 * (0.85 + 0.3 * p[q + 1]!));
    const heat = baseHeat - 0.8 + (1 - f) * 0.9 + p[q + 2]! * 0.8;
    // the stem thins out first as it is drawn up into the cap
    const stemFade = fade * (age < life - 110 ? 1 : (life - 30 - age) / 80);
    puff(normal, px, py, size, heat, Math.min(1, Math.max(0, stemFade)) * 0.95);
  }

  // skirt: a low ring of dust and smoke rolling out along the ground
  for (let i = 0; i < N_SKIRT; i++) {
    const q = (N_CAP + N_DOME + N_STEM + i) * 4;
    const side = i % 2 === 0 ? -1 : 1;
    const out = r * (0.3 + 1.3 * ease(Math.min(1, age / 140))) * (0.4 + 0.6 * p[q]!);
    const size = r * (0.16 + 0.14 * p[q + 1]!) * (0.6 + 0.6 * rise);
    puff(
      normal,
      x + side * out,
      y - size * 0.35 - p[q + 3]! * r * 0.12,
      size,
      4.6 + cool * 2.2 + p[q + 2]!,
      fade * 0.85,
    );
  }

  // cap: a torus rolling outward over the top and back in underneath
  for (let i = 0; i < N_CAP; i++) {
    const q = i * 4;
    const side = i % 2 === 0 ? -1 : 1;
    const a = p[q]! * Math.PI * 2 + roll * side;
    const ringX = capW * (0.45 + 0.3 * p[q + 3]!);
    const rr = capH * 0.85;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const px = x + drift + side * (ringX + ca * rr);
    const py = capY - sa * rr;
    const size = capH * (0.85 + 0.55 * p[q + 1]!);
    // underside (sa < 0) is hotter, the top cools into smoke first
    const heat = baseHeat + sa * 1.1 + p[q + 2]! * 0.9 - 0.4;
    puff(normal, px, py, size, heat, fade);
  }

  // dome: puffs heaped over the centre of the cap
  for (let i = 0; i < N_DOME; i++) {
    const q = (N_CAP + i) * 4;
    const u = p[q]! * 2 - 1;
    const px = x + drift + u * capW * 0.6;
    const py = capY + capH * 0.3 - capH * (0.2 + 1.0 * (1 - u * u)) * p[q + 3]!;
    const size = capH * (1.0 + 0.5 * p[q + 1]!);
    puff(normal, px, py, size, baseHeat + p[q + 2]! * 0.9 - 0.6, fade);
  }

  // fireball glow inside the cap and stem while it is still hot (hard bands, additive)
  const hot = boom > 0 ? since : age;
  if (hot < 120) {
    const k = 1 - hot / 120;
    const g = capW * 0.9;
    additive.push(x + drift, capY + capH * 0.2, g, g * 0.7, 0xff8a30, 0.55 * k * k, Shape.Pixel);
    additive.push(
      x,
      ground - stemLen * 0.4,
      r * 0.3,
      stemLen * 0.7,
      0xff6020,
      0.35 * k * k,
      Shape.Pixel,
    );
  }
  return true;
}

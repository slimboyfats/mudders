import { Shape, type QuadBatch } from './batch';

/**
 * Telepathy (weapon.telepathy) looks, render-only (§2a): the thought-orb shell, rings of psychic
 * static rolling out of the burst, rings sucked into a tank as the mind link takes, the pulsing
 * aura on a linked tank, and the tether of travelling sparks from the caster while it steers.
 * Everything is single cells in hard violet bands (no smooth glow), and every look is a pure
 * function of the event stream and the tick, so captures replay exactly.
 */

/** White-hot → pale lilac → violet → deep purple: the band a ring cell takes as it ages. */
export const PSI = [0xffffff, 0xf4c0ff, 0xd77cff, 0xa64cf0, 0x6a2cc0, 0x3a1680] as const;

export interface PsiWave {
  x: number;
  y: number;
  /** Final radius (outward) or start radius (inward), in cells. */
  r: number;
  start: number;
  dur: number;
  /** Rings in the wave, `gap` ticks apart. */
  rings: number;
  gap: number;
  /** True: rings shrink into the centre (a mind being taken). */
  inward: boolean;
}

/** Ticks a wave lives, all rings included. */
export function waveLife(w: PsiWave): number {
  return w.dur + (w.rings - 1) * w.gap;
}

function px(b: QuadBatch, x: number, y: number, color: number, alpha = 1): void {
  b.push(Math.round(x) + 0.5, Math.round(y) + 0.5, 1, 1, color, alpha, Shape.Rect);
}

/** Integer hash for stable per-cell variety. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 13)) >>> 0;
}

/**
 * One wave of psychic rings at render tick `t`. Each ring is a dotted circle whose radius ripples
 * with a six-lobed brainwave wobble that crawls round it; the dots skip in a crawling pattern so
 * the ring reads as static, and step from white-hot to deep violet as the ring ages. A darker echo
 * ring trails two cells behind. Cells inside solid ground are skipped.
 */
export function drawPsiWave(
  w: PsiWave,
  normal: QuadBatch,
  additive: QuadBatch,
  t: number,
  solid: (x: number, y: number) => boolean,
): void {
  const age = t - w.start;
  for (let k = 0; k < w.rings; k++) {
    const a = age - k * w.gap;
    if (a < 0 || a >= w.dur) continue;
    const f = a / w.dur;
    // ease out (outward) / ease in (inward), so rings burst fast and slow at the end
    const e = 1 - (1 - f) * (1 - f);
    const rr = w.inward ? Math.max(1, w.r * (1 - e)) : 2 + (w.r - 2) * e;
    const band = Math.min(PSI.length - 1, Math.floor(f * PSI.length));
    const col = PSI[band]!;
    const echo = PSI[Math.min(PSI.length - 1, band + 2)]!;
    const dots = Math.max(12, Math.round(rr * 4.2));
    const crawl = Math.floor(a / 2);
    const wob = Math.min(2.5, rr * 0.08 + 0.5);
    for (let i = 0; i < dots; i++) {
      if ((hash(i, k * 131 + crawl) & 3) === 0) continue; // static gaps
      const ang = (i / dots) * Math.PI * 2;
      const r = rr + Math.round(Math.sin(ang * 6 + a * 0.35 + k) * wob);
      const x = Math.round(w.x + Math.cos(ang) * r);
      const y = Math.round(w.y + Math.sin(ang) * r * 0.85);
      if (solid(x, y)) continue;
      if (band <= 1) px(additive, x, y, col, 0.9);
      else px(normal, x, y, col, 1);
      // the echo: a darker cell two cells inside (outside, for an inward ring), every other dot
      if ((i & 1) === 0 && band < PSI.length - 1) {
        const r2 = w.inward ? r + 2 : r - 2;
        if (r2 > 0) {
          const x2 = Math.round(w.x + Math.cos(ang) * r2);
          const y2 = Math.round(w.y + Math.sin(ang) * r2 * 0.85);
          if (!solid(x2, y2)) px(normal, x2, y2, echo, 1);
        }
      }
    }
  }
}

/** The Telepathy shell: a violet orb that pulses, with two sparks orbiting it on a tilted ring. */
export function drawPsiShell(
  normal: QuadBatch,
  additive: QuadBatch,
  fx: number,
  fy: number,
  id: number,
  tick: number,
): void {
  const x = Math.floor(fx) + 0.5;
  const y = Math.floor(fy) + 0.5;
  const pulse = (tick >> 2) & 1;
  normal.push(x, y, 3 + pulse * 2, 3 + pulse * 2, PSI[4], 1, Shape.Rect);
  normal.push(x, y, 3, 3, PSI[2], 1, Shape.Rect);
  additive.push(x, y, 1, 1, PSI[0], 1, Shape.Rect);
  for (let k = 0; k < 2; k++) {
    const ang = (tick + id * 7) * 0.45 + k * Math.PI;
    const ox = Math.round(Math.cos(ang) * 4);
    const oy = Math.round(Math.sin(ang) * 2);
    additive.push(x + ox, y + oy, 1, 1, k === 0 ? PSI[1] : PSI[2], 1, Shape.Rect);
  }
}

/**
 * The aura on a mind-linked tank: two dotted brainwave rings orbiting the hull in opposite
 * directions, beating in and out, with a few cells of static flicking off them, and a small eye
 * mark beside the health bar. `steered` (its caster is at the controls now) runs it brighter.
 */
export function drawPsiAura(
  normal: QuadBatch,
  additive: QuadBatch,
  x: number,
  cy: number,
  half: number,
  top: number,
  t: number,
  steered: boolean,
  markX: number,
): void {
  const tick = Math.floor(t);
  const beat = (tick >> 3) & 1;
  for (let k = 0; k < 2; k++) {
    const rx = half + 5 + beat + k * 3;
    const ry = 8 + beat + k * 2;
    const dots = 34 + k * 8;
    const dir = k === 0 ? 1 : -1;
    for (let i = 0; i < dots; i++) {
      if ((i + (tick >> 1) * dir) % 4 === 0) continue;
      const ang = (i / dots) * Math.PI * 2 + dir * tick * 0.06;
      const wob = Math.round(Math.sin(ang * 5 + tick * 0.3));
      const dx = Math.round(Math.cos(ang) * (rx + wob));
      const dy = Math.round(Math.sin(ang) * (ry + wob));
      const lit = (i + tick) % 7 === 0;
      if (lit || (steered && k === 0)) px(additive, x + dx, cy + dy, lit ? PSI[0] : PSI[1], 0.9);
      else px(normal, x + dx, cy + dy, PSI[2 + k]!, 1);
    }
  }
  // static: a couple of cells jumping off the aura
  const n = steered ? 7 : 3;
  for (let i = 0; i < n; i++) {
    const h = hash(tick, i * 977 + x);
    const ang = ((h & 1023) / 1024) * Math.PI * 2;
    const r = half + 6 + ((h >>> 10) % 5);
    px(additive, x + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.6 - 2, PSI[1], 0.9);
  }
  // eye mark: a 7×5 eye, iris blinking violet/white, beside the health bar
  const sx = markX;
  const sy = top - 7;
  normal.push(sx + 3.5, sy + 2.5, 9, 7, 0x000000, 0.6, Shape.Rect);
  normal.push(sx + 3.5, sy + 0.5, 5, 1, PSI[2], 1, Shape.Rect);
  normal.push(sx + 3.5, sy + 4.5, 5, 1, PSI[2], 1, Shape.Rect);
  normal.push(sx + 0.5, sy + 2.5, 1, 1, PSI[2], 1, Shape.Rect);
  normal.push(sx + 6.5, sy + 2.5, 1, 1, PSI[2], 1, Shape.Rect);
  normal.push(sx + 3.5, sy + 2.5, 5, 3, PSI[4], 1, Shape.Rect);
  px(steered && (tick & 8) === 0 ? additive : normal, sx + 3, sy + 2, steered ? PSI[0] : PSI[1]);
}

/**
 * The tether while the caster steers: a wavy line of cells arcing from the caster's tank to the
 * linked one, with bright pulses running down it towards the puppet.
 */
export function drawPsiTether(
  normal: QuadBatch,
  additive: QuadBatch,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: number,
  solid: (x: number, y: number) => boolean,
): void {
  const tick = Math.floor(t);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 4) return;
  // arc over the ground: lift the middle by a fifth of the span
  const lift = Math.min(90, len * 0.22);
  const steps = Math.ceil(len);
  let lx = Number.NaN;
  let ly = Number.NaN;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const wave = Math.sin(f * Math.PI * 9 - tick * 0.5) * 2 * Math.sin(f * Math.PI);
    const x = Math.round(x0 + dx * f + (-dy / len) * wave);
    const y = Math.round(y0 + dy * f - Math.sin(f * Math.PI) * lift + (dx / len) * wave);
    if (x === lx && y === ly) continue;
    lx = x;
    ly = y;
    if (solid(x, y)) continue;
    // pulses: every 14 steps a bright head with a two-step tail, running caster → puppet
    const ph = (((i - tick) % 14) + 14) % 14;
    if (ph === 0) {
      px(additive, x, y, PSI[0], 1);
      px(additive, x, y - 1, PSI[1], 0.9);
      px(additive, x, y + 1, PSI[1], 0.9);
    } else if (ph <= 3) px(additive, x, y, PSI[1], 0.95);
    else px(additive, x, y, ph < 8 ? PSI[2] : PSI[3], 0.75);
  }
}

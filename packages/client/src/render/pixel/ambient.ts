import type { ZoneView } from '@mudders/shared';
import { Shape, type QuadBatch } from './batch';
import { ZONE_COLOR } from './effects';
import type { PixelTheme } from './theme';

/**
 * Ambient layers (§2a): theme weather and lingering zones. Both are stateless: every particle's
 * position is a pure function of its index and the render time, so nothing is stored, nothing
 * drifts between clients, and a capture replays byte-identically. Everything snaps to map cells.
 */

/** Integer hash → [0, 1). */
function h01(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export interface AmbientProbe {
  width: number;
  height: number;
  solid(x: number, y: number): boolean;
  /** A pool of cold liquid (rain plinks into it instead of splashing off). */
  liquid?(x: number, y: number): boolean;
}

/**
 * Theme weather: rain (streaks that vanish into the ground with a splash), snow (drifting flakes),
 * embers (rising sparks) and dust (slow motes). Stars are drawn by the sky shader instead.
 */
export function drawWeather(
  normal: QuadBatch,
  additive: QuadBatch,
  theme: PixelTheme,
  t: number,
  wind: number,
  probe: AmbientProbe,
  mult: number,
): void {
  const a = theme.ambient;
  if (a.kind === 'none' || a.kind === 'stars' || a.density <= 0) return;
  const W = probe.width;
  const H = probe.height;
  const n = Math.round((a.density * W * mult) / 1000);
  const lean = Math.max(-1.5, Math.min(1.5, wind * 120));
  for (let i = 0; i < n; i++) {
    const r0 = h01(i, 1);
    const r1 = h01(i, 2);
    const r2 = h01(i, 3);
    if (a.kind === 'rain') {
      const speed = 4 + r2 * 2;
      const span = H + 40;
      const y = Math.floor(mod(t * speed + r1 * span, span)) - 20;
      const x = Math.floor(mod(r0 * W + (y + 20) * (0.35 + lean * 0.5), W));
      if (y < 0) continue;
      if (probe.solid(x, y)) continue;
      if (probe.solid(x, y + 1)) {
        if (probe.liquid?.(x, y + 1)) {
          // plink into a puddle: a droplet hops up and the surface lights either side
          normal.push(x + 0.5, y - 0.5, 1, 1, 0xe6f2ff, 0.8);
          normal.push(x - 0.5, y + 1.5, 1, 1, 0xa8d0f8, 0.7);
          normal.push(x + 1.5, y + 1.5, 1, 1, 0xa8d0f8, 0.7);
          continue;
        }
        // splash: two droplets either side of where it hits
        normal.push(x - 0.5, y + 0.5, 1, 1, a.color, 0.7);
        normal.push(x + 1.5, y - 0.5, 1, 1, a.color, 0.5);
        continue;
      }
      normal.push(x + 0.5, y - 2, 1, 5, a.color, 0.4 + r2 * 0.3);
    } else if (a.kind === 'snow') {
      const speed = 0.25 + r2 * 0.3;
      const span = H + 10;
      const y = Math.floor(mod(t * speed + r1 * span, span)) - 5;
      const sway = Math.round(Math.sin(t * 0.03 + r0 * 40) * 2 + y * lean * 0.3);
      const x = Math.floor(mod(r0 * W + sway, W));
      if (y < 0 || probe.solid(x, y)) continue;
      const size = r2 > 0.8 ? 2 : 1;
      normal.push(x + size / 2, y + size / 2, size, size, a.color, 0.85);
    } else if (a.kind === 'embers') {
      const speed = 0.3 + r2 * 0.5;
      const span = H + 10;
      const y = H - Math.floor(mod(t * speed + r1 * span, span));
      const sway = Math.round(Math.sin(t * 0.05 + r0 * 30) * 3 + (H - y) * lean * 0.4);
      const x = Math.floor(mod(r0 * W + sway, W));
      if (y < 0 || y >= H || probe.solid(x, y)) continue;
      // flicker between two heats; fade near the top
      const hot = h01(i, Math.floor(t / 6)) > 0.5;
      additive.push(x + 0.5, y + 0.5, 1, 1, hot ? 0xffd070 : a.color, Math.min(1, y / (H * 0.4)));
    } else {
      // dust motes
      const x = Math.floor(mod(r0 * W + t * (0.08 + r2 * 0.1) * (lean >= 0 ? 1 : -1), W));
      const y = Math.floor(r1 * H * 0.85 + Math.sin(t * 0.02 + r0 * 50) * 4);
      if (y < 0 || probe.solid(x, y)) continue;
      normal.push(x + 0.5, y + 0.5, 1, 1, a.color, 0.3 + r2 * 0.3);
    }
  }
}

/**
 * Lingering zones: a gas cloud of drifting dithered puffs, an acid haze dripping green drops, and a
 * resonance field of pulsing cell rings. Fades as its turns run out.
 */
export function drawZones(
  normal: QuadBatch,
  additive: QuadBatch,
  zones: readonly ZoneView[],
  t: number,
  probe: AmbientProbe,
  mult: number,
): void {
  for (let zi = 0; zi < zones.length; zi++) {
    const z = zones[zi]!;
    if (z.puffs && z.puffs.length > 0) {
      drawCloud(normal, z, t, probe, mult);
      continue;
    }
    const R = Math.max(4, z.radius);
    const fade = Math.min(1, 0.45 + z.turns * 0.2);
    const salt = z.x * 131 + z.y * 7;
    if (z.look === 'gas' || z.look === 'acid') {
      const col = z.look === 'gas' ? ZONE_COLOR[0] : ZONE_COLOR[1];
      const puffs = Math.round(Math.min(40, (R * R) / 60 + 6) * Math.max(0.5, mult));
      for (let i = 0; i < puffs; i++) {
        const ang = h01(i, salt) * Math.PI * 2 + t * 0.008 * (h01(i, salt + 1) - 0.5);
        const rad = Math.sqrt(h01(i, salt + 2)) * R * 0.85;
        const x = Math.round(z.x + Math.cos(ang) * rad + Math.sin(t * 0.02 + i) * 2);
        const y = Math.round(z.y + Math.sin(ang) * rad * 0.6 - 2);
        const size = 5 + h01(i, salt + 3) * 7;
        normal.push(x, y, size, size, col, (z.look === 'gas' ? 0.3 : 0.2) * fade, Shape.Pixel);
      }
      if (z.look === 'acid') {
        const drops = Math.round(Math.min(30, R / 2 + 4) * Math.max(0.5, mult));
        for (let i = 0; i < drops; i++) {
          const x = Math.round(z.x + (h01(i, salt + 4) - 0.5) * R * 1.6);
          const span = R * 1.4;
          const y = Math.round(z.y - R * 0.4 + mod(t * 1.2 + h01(i, salt + 5) * span, span));
          if (probe.solid(x, y)) continue;
          normal.push(x + 0.5, y, 1, 2, 0xd8ff60, 0.85 * fade);
        }
      }
    } else if (z.look === 'volcano') {
      drawVolcano(normal, additive, z, t, probe, mult, fade, salt);
    } else {
      // resonance: two rings of single cells expanding from the centre, plus a pulsing core
      for (let k = 0; k < 2; k++) {
        const ph = mod(t / 50 + k / 2, 1);
        const r = Math.max(2, R * ph);
        const steps = Math.max(12, Math.round(r * 5));
        const alpha = (1 - ph) * 0.8 * fade;
        let lx = NaN;
        let ly = NaN;
        for (let s = 0; s < steps; s++) {
          const ang = (s / steps) * Math.PI * 2;
          const x = Math.round(z.x + Math.cos(ang) * r);
          const y = Math.round(z.y + Math.sin(ang) * r);
          if (x === lx && y === ly) continue;
          lx = x;
          ly = y;
          if (probe.solid(x, y)) continue;
          additive.push(x + 0.5, y + 0.5, 1, 1, ZONE_COLOR[2], alpha);
        }
      }
      const beat = mod(t, 25) < 4 ? 1 : 0.5;
      additive.push(z.x + 0.5, z.y + 0.5, 6, 6, ZONE_COLOR[2], 0.5 * beat * fade, Shape.Pixel);
    }
  }
}

/** Volcano ash, darkest at the vent; embers. */
const ASH = [0x3a3034, 0x544a4e, 0x6e6468, 0x8a8084] as const;
const EMBER = [0xff7a24, 0xffa838, 0xffe070] as const;

/**
 * A smoking volcano (Volcano Seed): blocky ash puffs boil up out of the vent at the top of the
 * column, grow and pale as they rise, and lean downwind; embers spark up out of the crater.
 * Thins as the zone's turns run out.
 */
function drawVolcano(
  normal: QuadBatch,
  additive: QuadBatch,
  z: ZoneView,
  t: number,
  probe: AmbientProbe,
  mult: number,
  fade: number,
  salt: number,
): void {
  // the vent: the top of the column (the cone may have grown, been blasted or buried)
  let vy = 0;
  while (vy < probe.height && !probe.solid(z.x, vy)) vy++;
  if (vy >= probe.height) return;
  const rise = 150;
  const puffs = Math.round(40 * Math.max(0.5, mult) * fade);
  for (let i = 0; i < puffs; i++) {
    const ph = mod(t / rise + h01(i, salt), 1);
    const up = ph * (60 + h01(i, salt + 1) * 40);
    const lean = ph * ph * 26 * (h01(i, salt + 9) < 0.5 ? 1 : 0.6);
    const x = Math.round(z.x + (h01(i, salt + 2) - 0.5) * (4 + ph * 22) + lean);
    const y = Math.round(vy - 3 - up);
    // snap sizes to whole cells, 2..10
    const size = 2 * Math.round(1 + ph * 3 + h01(i, salt + 3) * 1.5);
    const band = Math.min(3, Math.floor(ph * 4 + h01(i, salt + 4) * 0.8));
    const alpha = (ph < 0.08 ? ph / 0.08 : 1 - (ph - 0.08) / 0.92) * 0.85 * fade;
    normal.push(x, y, size, size, ASH[band]!, alpha, Shape.Pixel);
  }
  const embers = Math.round(8 * Math.max(0.5, mult) * fade);
  for (let i = 0; i < embers; i++) {
    const ph = mod(t / 60 + h01(i, salt + 5), 1);
    const x = Math.round(z.x + (h01(i, salt + 6) - 0.5) * 8 + (h01(i, salt + 7) - 0.5) * ph * 20);
    const y = Math.round(vy - 2 - ph * (20 + h01(i, salt + 8) * 30));
    if (probe.solid(x, y)) continue;
    additive.push(x + 0.5, y + 0.5, 1, 1, EMBER[i % 3]!, (1 - ph) * 0.9 * fade);
  }
}

/** Gas cloud bands, dark core to lit top: colour and alpha. */
const GAS_CORE = 0x4a7a0c;
const GAS_MID = 0x8cc81a;
const GAS_LIGHT = 0xb8ec2c;
const GAS_TOP = 0xeaff7a;
const GAS_EDGE = 0xa6e024;

/** Gas density per cell over the cloud's box (reused between frames). */
let dens = new Float32Array(4096);

/** Smooth value noise in [0, 1) on an integer lattice (cosmetic only). */
function vnoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = lat(ix, iy, salt);
  const b = lat(ix + 1, iy, salt);
  const c = lat(ix, iy + 1, salt);
  const top = a + (b - a) * sx;
  const bot = c + (lat(ix + 1, iy + 1, salt) - c) * sx;
  return top + (bot - top) * sy;
}

function lat(x: number, y: number, salt: number): number {
  return h01((x & 1023) + ((y & 1023) << 10), salt);
}

/**
 * Gas cloud (sim puffs): a density field summed from wobbling puffs, rolled by moving noise, then
 * cut into hard colour bands per map cell: dark core, acid body, lit tops, dithered fringe. Only
 * air cells are drawn, so the gas fills a valley or crater to the shape of the ground. Bright
 * bubbles rise through it. Horizontal runs of one band go out as one quad.
 */
function drawCloud(
  normal: QuadBatch,
  z: ZoneView,
  t: number,
  probe: AmbientProbe,
  mult: number,
): void {
  const pf = z.puffs!;
  const n = pf.length >> 1;
  const R0 = Math.max(3, z.puffRadius ?? 10);
  const age = z.age ?? 1000;
  // bursts out small and swells over the first second; thins on its last turn
  const grow = Math.min(1, 0.3 + age / 50);
  const thin = z.turns <= 1 ? 0.8 : 1;
  let mx0 = Infinity;
  let my0 = Infinity;
  let mx1 = -Infinity;
  let my1 = -Infinity;
  for (let i = 0; i < n; i++) {
    mx0 = Math.min(mx0, pf[2 * i]!);
    mx1 = Math.max(mx1, pf[2 * i]!);
    my0 = Math.min(my0, pf[2 * i + 1]!);
    my1 = Math.max(my1, pf[2 * i + 1]!);
  }
  const pad = Math.ceil(R0 * 1.5) + 3;
  const x0 = Math.max(0, mx0 - pad);
  const y0 = Math.max(0, my0 - pad - 4);
  const x1 = Math.min(probe.width, mx1 + pad);
  const y1 = Math.min(probe.height, my1 + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  if (dens.length < w * h) dens = new Float32Array(w * h * 2);
  dens.fill(0, 0, w * h);
  for (let i = 0; i < n; i++) {
    const ph = i * 2.399;
    const R = R0 * grow * (0.82 + 0.22 * Math.sin(t * 0.045 + ph));
    const cx = pf[2 * i]! + 0.5 + Math.sin(t * 0.031 + ph * 1.3) * 1.6;
    // puffs sit on the ground: lift each one so most of it is above its centre cell
    const cy = pf[2 * i + 1]! + 0.5 - R * 0.35 + Math.cos(t * 0.037 + ph) * 1.1;
    const reach = R * 1.2;
    const inv = 1 / (reach * reach);
    const ra = Math.max(x0, Math.floor(cx - reach));
    const rb = Math.min(x1 - 1, Math.ceil(cx + reach));
    const ca = Math.max(y0, Math.floor(cy - reach));
    const cb = Math.min(y1 - 1, Math.ceil(cy + reach));
    for (let y = ca; y <= cb; y++) {
      // a little flatter than round: gas spreads more than it stacks
      const dy = (y + 0.5 - cy) * 1.25;
      const row = (y - y0) * w - x0;
      for (let x = ra; x <= rb; x++) {
        const dx = x + 0.5 - cx;
        const q = 1 - (dx * dx + dy * dy) * inv;
        if (q > 0) dens[row + x] = dens[row + x]! + q * thin;
      }
    }
  }
  const roll = t * 0.05;
  for (let y = y0; y < y1; y++) {
    const row = (y - y0) * w - x0;
    let runX = -1;
    let runC = 0;
    let runA = 0;
    for (let x = x0; x <= x1; x++) {
      let c = 0;
      let a = 0;
      if (x < x1) {
        const d0 = dens[row + x]!;
        if (d0 > 0.12 && !probe.solid(x, y)) {
          // rolling billows: noise drifting sideways and up through the body
          const nz =
            vnoise((x - roll) / 7, (y + roll * 0.6) / 5, 41) * 0.7 +
            vnoise(x / 3, (y + roll) / 3, 42) * 0.3;
          const d = d0 * (0.6 + 0.8 * nz);
          const above = y - 2 >= y0 ? dens[row - 2 * w + x]! : 0;
          if (d > 1.7) {
            c = GAS_CORE;
            a = 0.72;
          } else if (d > 0.9) {
            c = above < 0.45 ? GAS_TOP : GAS_MID;
            a = above < 0.45 ? 0.78 : 0.62;
          } else if (d > 0.45) {
            c = above < 0.25 ? GAS_TOP : GAS_LIGHT;
            a = 0.5;
          } else if (d > 0.2 && ((x + y) & 1) === 0) {
            c = GAS_EDGE;
            a = 0.45;
          } else if (d > 0.3 && ((x ^ y) & 3) === 1) {
            c = GAS_EDGE;
            a = 0.35;
          }
        }
      }
      if (c === runC && a === runA && runX >= 0) continue;
      if (runX >= 0 && runC !== 0) normal.rect(runX, y, x - runX, 1, runC, runA);
      runX = x;
      runC = c;
      runA = a;
    }
  }
  // wisps: thin dithered tendrils curling up off the top of the cloud and thinning out
  const wisps = Math.round(n * 1.5 * Math.max(0.4, mult));
  for (let i = 0; i < wisps; i++) {
    const k = i % n;
    const R = R0 * grow;
    const life = 90 + h01(i, 61) * 80;
    const ph = mod(t + h01(i, 62) * life, life) / life;
    const bx = pf[2 * k]! + (h01(i, 63) - 0.5) * R * 1.6;
    const top = pf[2 * k + 1]! - R * 0.9;
    const len = 6 + Math.floor(h01(i, 64) * 10);
    for (let s = 0; s < len; s++) {
      const y = Math.floor(top - ph * R * 1.2 - s);
      const x = Math.floor(bx + Math.sin(t * 0.04 + s * 0.45 + i) * (1 + s * 0.25));
      if (((x + y) & 1) === 1 && s > 2) continue;
      if (y < 0 || probe.solid(x, y)) break;
      normal.push(
        x + 0.5,
        y + 0.5,
        1,
        1,
        s < 3 ? GAS_LIGHT : GAS_EDGE,
        (1 - ph) * (1 - s / len) * 0.6 * thin,
      );
    }
  }
  // bubbles: single bright cells rising through the thick of it and popping at the top
  const bubbles = Math.round(n * 2 * Math.max(0.4, mult));
  const salt = 977;
  for (let i = 0; i < bubbles; i++) {
    const k = i % n;
    const R = R0 * grow;
    const span = R * 1.4;
    const rise = mod(t * (0.18 + h01(i, salt) * 0.2) + h01(i, salt + 1) * span, span);
    const x = Math.floor(pf[2 * k]! + (h01(i, salt + 2) - 0.5) * R * 1.4);
    const y = Math.floor(pf[2 * k + 1]! + 1 - rise);
    if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
    if (dens[(y - y0) * w + (x - x0)]! < 0.5 || probe.solid(x, y)) continue;
    normal.push(x + 0.5, y + 0.5, 1, 1, rise > span * 0.85 ? 0xffffc0 : GAS_TOP, 0.9 * thin);
  }
}

/** Storm theme: sky lightning brightness at time `t` (0 = none), every ~`every` ticks. */
export function stormFlash(t: number, every: number): number {
  if (every <= 0) return 0;
  const win = Math.floor(t / 30);
  if (h01(win, 91) >= 30 / every) return 0;
  const age = t - win * 30;
  return age < 2 ? 0.32 : age >= 3 && age < 5 ? 0.18 : 0;
}

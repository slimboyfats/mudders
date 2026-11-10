import type { ZoneView } from '@mudders/shared';
import { Shape, type QuadBatch } from './batch';
import { PKind, type ParticleSink } from './particles';
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
  // rain and snow fall as GPU particles now (see `emitWeather`)
  if (a.kind === 'rain' || a.kind === 'snow') return;
  const W = probe.width;
  const H = probe.height;
  const n = Math.round((a.density * W * mult) / 1000);
  const lean = Math.max(-1.5, Math.min(1.5, wind * 120));
  for (let i = 0; i < n; i++) {
    const r0 = h01(i, 1);
    const r1 = h01(i, 2);
    const r2 = h01(i, 3);
    if (a.kind === 'embers') {
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
 * This tick's rain or snow, spawned into the GPU engine along the top of the map (and a little
 * past the sides, so the wind can carry it in): rain as streaks that splash where they land,
 * snow as swaying flakes that settle. Density is the theme's; the count per tick is set so the
 * same number is in the air as the old drawn weather had, times the extra the GPU affords.
 */
export function emitWeather(
  sink: ParticleSink,
  theme: PixelTheme,
  t: number,
  wind: number,
  probe: AmbientProbe,
  mult: number,
): void {
  const a = theme.ambient;
  if ((a.kind !== 'rain' && a.kind !== 'snow') || a.density <= 0) return;
  const W = probe.width;
  const H = probe.height;
  const rain = a.kind === 'rain';
  // in the air at once ≈ density × W/1000 × 14 (rain) or × 15 (snow); each lives about H / speed
  // ticks. Several times the old drawn weather: the GPU can afford a real downpour
  const speed = rain ? 4.8 : 0.65;
  const perTick = (((a.density * W * mult) / 1000) * (rain ? 14 : 15)) / (H / speed);
  let n = Math.floor(perTick);
  if (h01(t, 977) < perTick - n) n++;
  const lean = Math.max(-1.5, Math.min(1.5, wind * 120));
  const margin = Math.abs(lean) * H * 0.4 + 10;
  for (let i = 0; i < n; i++) {
    const r0 = h01(t * 131 + i, 1);
    const r1 = h01(t * 131 + i, 2);
    const r2 = h01(t * 131 + i, 3);
    const x = -margin * (lean > 0 ? 1 : 0) + r0 * (W + margin);
    if (rain) {
      sink.add({
        x,
        y: -2 - r1 * 6,
        vx: lean * 0.9,
        vy: 4 + r2 * 2,
        life: H / 4 + 60,
        size: 1,
        color: a.color,
        kind: PKind.Rain,
      });
    } else {
      sink.add({
        x,
        y: -2 - r1 * 6,
        vx: lean * 0.3 + (r2 - 0.5) * 0.3,
        vy: 0.45 + r2 * 0.4,
        life: H / 0.55 + 120 + r1 * 200,
        size: r2 > 0.7 ? 2 : 1,
        color: a.color,
        kind: PKind.Flake,
      });
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
      // a puff cloud is single gas cells riding the air (PixelAir.cloud); only its bubbles here
      drawBubbles(normal, z, t, probe, mult);
      continue;
    }
    const R = Math.max(4, z.radius);
    const fade = Math.min(1, 0.45 + z.turns * 0.2);
    const salt = z.x * 131 + z.y * 7;
    if (z.look === 'gas' || z.look === 'acid') {
      // the haze itself is single gas cells riding the air (renderer feedFluid)
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
    } else if (z.look === 'storm') {
      drawStorm(normal, additive, z, t, probe, mult, fade, salt);
    } else if (z.look === 'acid-cloud') {
      drawStorm(normal, additive, z, t, probe, mult, fade, salt, ACID_STORM);
    } else if (z.look === 'caltrops') {
      drawCaltrops(normal, z, t, probe, fade);
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

/** Storm cloud bands, lit top to dark underside; rain; the glow of lightning inside the cloud. */
const STORM = [0x8a92a4, 0x5e6474, 0x434856, 0x2c3039] as const;
const STORM_RAIN = 0x9aa8c4;
const STORM_GLOW = 0xd8e0ff;

interface StormPalette {
  bands: readonly [number, number, number, number];
  rain: number;
  /** Lightning playing in the cloud (null = none). */
  glow: number | null;
  /** Rain drops are fat beads instead of streaks. */
  beads: boolean;
}
const GREY_STORM: StormPalette = { bands: STORM, rain: STORM_RAIN, glow: STORM_GLOW, beads: false };
/** Acid Cloud: a bilious yellow-green crown over a murky olive belly, dripping lime beads. */
const ACID_STORM: StormPalette = {
  bands: [0xd6e070, 0xa4b43c, 0x6e7c28, 0x434a1c],
  rain: 0xc8f040,
  glow: null,
  beads: true,
};

/** Caltrop steel: shadow, body, lit edge, and the odd glint. */
const CALTROP = [0x30333a, 0x9aa0aa, 0xe0e4ec, 0xffffff] as const;

/**
 * Caltrop Field: little four-pointed spikes scattered on the ground across the zone, each sitting
 * on the first solid cell of its column, snapped to whole cells. A spike now and then catches the
 * light. Thins out as the zone's turns run out.
 */
function drawCaltrops(
  normal: QuadBatch,
  z: ZoneView,
  t: number,
  probe: AmbientProbe,
  fade: number,
): void {
  const R = Math.max(4, z.radius);
  const salt = z.x * 31 + z.y * 17;
  const keep = Math.min(1, 0.4 + z.turns * 0.1);
  for (let x = z.x - R; x <= z.x + R; x++) {
    if (x < 1 || x >= probe.width - 1) continue;
    // about one spike every three columns, never two side by side
    const r = h01(x, salt);
    if (r > 0.42 * keep || h01(x - 1, salt) <= 0.42 * keep) continue;
    // the ground: the first solid cell searched down from above the zone
    let y = z.y - R;
    const bottom = Math.min(probe.height - 1, z.y + R);
    if (y < 0) y = 0;
    while (y <= bottom && !probe.solid(x, y)) y++;
    if (y > bottom || y === 0) continue;
    const top = y - 1;
    const flip = h01(x, salt + 1) < 0.5;
    // a squat tetrapod: dark feet either side, a steel body, a point sticking up and one leaning
    normal.push(x - 0.5, top + 0.5, 1, 1, CALTROP[0]!, fade);
    normal.push(x + 1.5, top + 0.5, 1, 1, CALTROP[0]!, fade);
    normal.push(x + 0.5, top + 0.5, 1, 1, CALTROP[1]!, fade);
    normal.push(x + 0.5, top - 0.5, 1, 1, CALTROP[1]!, fade);
    normal.push(x + 0.5, top - 1.5, 1, 1, CALTROP[2]!, fade);
    normal.push(x + (flip ? 1.5 : -0.5), top - 0.5, 1, 1, CALTROP[2]!, fade);
    // glint: a single white cell for a few ticks, now and then
    if (mod(t + Math.floor(h01(x, salt + 3) * 240), 240) < 4) {
      normal.push(x + 0.5, top - 1.5, 1, 1, CALTROP[3]!, fade);
    }
  }
}
/** Ticks a storm's cloud banks take to roll together. */
const GATHER_TICKS = 90;

/**
 * A thundercloud (Thunderstorm): a heavy anvil of cells hanging at the zone's row, its top rolling
 * slowly, cut into hard bands from a lit crown to a near-black underside with a dithered rim. Rain
 * streaks fall from its base to the ground under it, and every so often a patch inside it lights
 * up white-blue (lightning playing in the cloud). Thins and shrinks as its turns run out.
 */
function drawStorm(
  normal: QuadBatch,
  additive: QuadBatch,
  z: ZoneView,
  t: number,
  probe: AmbientProbe,
  mult: number,
  fade: number,
  salt: number,
  pal: StormPalette = GREY_STORM,
): void {
  const R = Math.max(8, z.radius);
  const half = Math.round(R + 18);
  const base = z.y;
  const wide = R > 150;
  // separate puffy clouds that sail in from both sides and bunch up into one storm
  const n = wide ? Math.max(6, Math.round((half * 2) / 72)) : 3;
  const step = (half * 2) / n;
  const cw = step * 1.7;
  const lobeR = wide ? 26 : 15;
  const slot = Math.floor(t / 7);
  const flickOn = pal.glow !== null && h01(slot, salt + 11) < 0.14;
  const flickCloud = Math.floor(h01(slot, salt + 12) * n);
  let gathered = 0;
  for (let i = 0; i < n; i++) {
    const fx = z.x - half + step * (i + 0.5) + (h01(i, salt + 30) - 0.5) * step * 0.4;
    // each cloud arrives at its own time, the ones nearest the middle last
    const arrive = GATHER_TICKS * (0.55 + 0.45 * h01(i, salt + 31));
    const g = Math.min(1, (z.age ?? GATHER_TICKS) / arrive);
    const ease = 1 - (1 - g) * (1 - g) * (1 - g);
    gathered += ease;
    const fromLeft = fx < z.x;
    const sx = fromLeft ? z.x - half - cw : z.x + half + cw;
    const ccx = Math.round(sx + (fx - sx) * ease + Math.sin(t * 0.01 + i * 1.7) * 2);
    const cb = base + Math.round((h01(i, salt + 32) - 0.5) * 6);
    const thin = 0.75 + 0.25 * fade;
    drawStormCloud(
      normal,
      additive,
      ccx,
      cb,
      cw,
      lobeR * thin * (0.8 + 0.4 * h01(i, salt + 33)),
      i * 97 + salt,
      t,
      probe,
      flickOn && i === flickCloud,
      pal,
    );
  }
  const ease = gathered / n;
  // rain from the cloud base down to the ground under it
  const drops = Math.round(R * 1.6 * Math.max(0.4, mult) * fade * ease);
  for (let i = 0; i < drops; i++) {
    const r0 = h01(i, salt + 20);
    const r1 = h01(i, salt + 21);
    const speed = 4 + h01(i, salt + 22) * 2;
    const fall = probe.height - base + 10;
    const d = Math.floor(mod(t * speed + r1 * fall, fall));
    const y = base + 2 + d;
    const x = Math.round(z.x + (r0 - 0.5) * R * 2 + d * 0.25);
    if (y >= probe.height || x < 0 || x >= probe.width) continue;
    if (probe.solid(x, y)) continue;
    if (probe.solid(x, y + 1)) {
      normal.push(x - 0.5, y + 0.5, 1, 1, pal.rain, 0.7 * fade);
      normal.push(x + 1.5, y - 0.5, 1, 1, pal.rain, 0.5 * fade);
      continue;
    }
    if (pal.beads) {
      // fat beads: a lit cell over a body cell
      normal.push(x + 0.5, y - 0.5, 1, 1, 0xf0ffa0, 0.8 * fade);
      normal.push(x + 0.5, y + 0.5, 1, 1, pal.rain, 0.8 * fade);
      continue;
    }
    normal.push(x + 0.5, y - 2, 1, 4, pal.rain, 0.55 * fade);
  }
}

/**
 * One storm cloud: a few round lobes over a flat, sagging base, filled per map cell in hard bands
 * from a lit crown to a near-black underside, with a dithered rim on top. `glow` lights its belly.
 */
function drawStormCloud(
  normal: QuadBatch,
  additive: QuadBatch,
  cx: number,
  base: number,
  w: number,
  lobe: number,
  salt: number,
  t: number,
  probe: AmbientProbe,
  glow: boolean,
  pal: StormPalette = GREY_STORM,
): void {
  const K = 4;
  const lx: number[] = [];
  const ly: number[] = [];
  const lr: number[] = [];
  for (let k = 0; k < K; k++) {
    const r = lobe * (0.6 + 0.45 * h01(k, salt + 1)) * (k === 1 || k === 2 ? 1.15 : 0.8);
    lx.push((k / (K - 1) - 0.5) * (w - lobe * 1.4) + (h01(k, salt + 2) - 0.5) * lobe * 0.4);
    ly.push(-r * 0.55 + Math.sin(t * 0.015 + k + salt) * 0.8);
    lr.push(r);
  }
  const x0 = Math.floor(cx - w / 2);
  const x1 = Math.ceil(cx + w / 2);
  for (let x = x0; x <= x1; x++) {
    if (x < 0 || x >= probe.width) continue;
    const dx = x - cx;
    let top = Infinity;
    for (let k = 0; k < K; k++) {
      const d = dx - lx[k]!;
      const r = lr[k]!;
      if (d * d >= r * r) continue;
      top = Math.min(top, base + ly[k]! - Math.sqrt(r * r - d * d));
    }
    if (top === Infinity) continue;
    const ty = Math.round(top);
    const by = base + Math.round(1.5 + Math.sin(x * 0.4 + salt) * 1.2);
    const span = Math.max(1, by - ty);
    for (let y = ty; y <= by; y++) {
      if (y < 0 || y >= probe.height) continue;
      const rim = y === ty || y === by;
      if (rim && ((x + y) & 1) === 0) continue;
      const f = (y - ty) / span;
      const band = f < 0.22 ? 0 : f < 0.5 ? 1 : f < 0.8 ? 2 : 3;
      normal.push(x + 0.5, y + 0.5, 1, 1, pal.bands[band]!, rim ? 0.75 : 1);
      if (glow && pal.glow !== null && f > 0.3 && ((x * 3 + y) & 3) !== 0) {
        additive.push(x + 0.5, y + 0.5, 1, 1, pal.glow, 0.4);
      }
    }
  }
}

/** A gas cloud's bubbles. */
const GAS_TOP = 0xeaff7a;

/** Gas cloud (sim puffs): single bright cells rising through it and popping at the top. */
function drawBubbles(
  normal: QuadBatch,
  z: ZoneView,
  t: number,
  probe: AmbientProbe,
  mult: number,
): void {
  const pf = z.puffs!;
  const n = pf.length >> 1;
  const R = Math.max(3, z.puffRadius ?? 10) * Math.min(1, 0.3 + (z.age ?? 1000) / 50);
  const thin = z.turns <= 1 ? 0.8 : 1;
  const bubbles = Math.round(n * 2 * Math.max(0.4, mult));
  const salt = 977;
  const span = R * 1.4;
  for (let i = 0; i < bubbles; i++) {
    const k = i % n;
    const rise = mod(t * (0.18 + h01(i, salt) * 0.2) + h01(i, salt + 1) * span, span);
    const x = Math.floor(pf[2 * k]! + (h01(i, salt + 2) - 0.5) * R * 1.4);
    const y = Math.floor(pf[2 * k + 1]! + 1 - rise);
    if (y < 0 || probe.solid(x, y)) continue;
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

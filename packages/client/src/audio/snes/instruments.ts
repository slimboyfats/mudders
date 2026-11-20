/**
 * SNES-style instruments (§8b): short sampled-chip voices like the 16-bit console's sound chip
 * used, built here in code (no recorded audio): additive waves with an attack that changes over its
 * first moments, then a seamless loop of whole cycles; plucked strings by Karplus-Strong; drums from
 * LFSR noise and swept tones. Samples are 32 kHz and coarsely quantised like BRR, so they keep a
 * little of that grain. Deterministic: no randomness, the same buffers every time.
 */
export const RATE = 32000;

export type InstrumentId =
  | 'strings'
  | 'choir'
  | 'brass'
  | 'bass'
  | 'flute'
  | 'harp'
  | 'timpani'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'crash';

export interface Envelope {
  /** Seconds to full level. */
  attack: number;
  /** Seconds (time constant) from full down to `sustain`. */
  decay: number;
  /** Level held while the note lasts, 0-1 of its velocity. */
  sustain: number;
  /** Seconds to silence after the note ends. */
  release: number;
}

export interface Instrument {
  buffer: AudioBuffer;
  /** Pitch the sample plays at rate 1, Hz (0 = unpitched drum). */
  base: number;
  /** Loop region in seconds, or null for a one-shot. */
  loop: [number, number] | null;
  env: Envelope;
  /** Level against the other instruments. */
  gain: number;
}

/** 15-bit LFSR noise in -1..1, one step per sample. */
function noise(n: number, seed = 1): Float32Array {
  const out = new Float32Array(n);
  let reg = seed;
  for (let i = 0; i < n; i++) {
    const bit = (reg ^ (reg >> 1)) & 1;
    reg = (reg >> 1) | (bit << 14);
    // four register bits make a coarse level, closer to white than a 1-bit hiss
    out[i] = ((reg & 15) - 7.5) / 7.5;
  }
  return out;
}

/** Quantise like a 4-bit-per-sample BRR block with a fitted range: a faint grain, no clicks. */
function brr(d: Float32Array): void {
  for (let i = 0; i < d.length; i += 16) {
    let peak = 0;
    for (let k = i; k < i + 16 && k < d.length; k++) peak = Math.max(peak, Math.abs(d[k]!));
    if (peak === 0) continue;
    // 4 bits plus a shift: steps of peak/8, never finer than 1/1024
    const step = Math.max(1 / 1024, peak / 64);
    for (let k = i; k < i + 16 && k < d.length; k++) d[k] = Math.round(d[k]! / step) * step;
  }
}

function normalise(d: Float32Array, to = 0.9): void {
  let peak = 0;
  for (const v of d) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < d.length; i++) d[i] = (d[i]! / peak) * to;
}

/**
 * Additive wave at `base` Hz (whole cycles of `RATE / base` samples) whose harmonic amplitudes
 * move from `from` to `to` over `morph` seconds, then held for `hold` seconds: the last
 * `loopCycles` cycles are the loop.
 */
function morphWave(
  base: number,
  from: readonly number[],
  to: readonly number[],
  morph: number,
  hold: number,
  breath = 0,
): { data: Float32Array; loop: [number, number] } {
  const cycle = RATE / base;
  const cycles = Math.ceil(((morph + hold) * RATE) / cycle);
  const n = Math.round(cycles * cycle);
  const d = new Float32Array(n);
  const nz = breath > 0 ? noise(n, 77) : null;
  const harmonics = Math.max(from.length, to.length);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const k = Math.min(1, t / Math.max(1e-6, morph));
    let v = 0;
    for (let h = 0; h < harmonics; h++) {
      const a = (from[h] ?? 0) * (1 - k) + (to[h] ?? 0) * k;
      if (a !== 0) v += a * Math.sin((2 * Math.PI * (h + 1) * i) / cycle);
    }
    if (nz) v += nz[i]! * breath * Math.max(0, 1 - t / 0.08);
    d[i] = v;
  }
  normalise(d);
  const loopStart = Math.round((cycles - 4) * cycle);
  return { data: d, loop: [loopStart / RATE, n / RATE] };
}

/**
 * Several detuned copies of a wave (a section of players), as a seamless loop: each copy has a
 * whole number of cycles in the loop, so `cycles` ± 1 per voice.
 */
function ensemble(
  cycles: number,
  seconds: number,
  harmonics: readonly number[],
  detune: readonly number[],
): Float32Array {
  const n = Math.round(seconds * RATE);
  const d = new Float32Array(n);
  detune.forEach((dc, j) => {
    const c = cycles + dc;
    const phase = j * 0.37;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let h = 0; h < harmonics.length; h++) {
        const a = harmonics[h]!;
        if (a !== 0) v += a * Math.sin(2 * Math.PI * (((h + 1) * (c * i)) / n + phase * (h + 1)));
      }
      d[i]! += v;
    }
  });
  normalise(d);
  return d;
}

/** Karplus-Strong pluck at `base` Hz (period a whole number of samples). */
function pluck(base: number, seconds: number, damp: number): Float32Array {
  const p = Math.round(RATE / base);
  const n = Math.round(seconds * RATE);
  const d = new Float32Array(n);
  const nz = noise(p, 909);
  for (let i = 0; i < p; i++) d[i] = nz[i]! * (0.5 + 0.5 * Math.sin((Math.PI * i) / p));
  for (let i = p; i < n; i++) d[i] = (d[i - p]! + d[i - p + 1]!) * 0.5 * damp;
  normalise(d, 0.85);
  return d;
}

/** Saw-like harmonics 1/k, rolled off from `soft` up (a warm, filtered sample). */
function sawHarmonics(count: number, soft: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const k = i + 1;
    return 1 / k / (1 + (k / soft) ** 2);
  });
}

/** Harmonics shaped by vowel formants (centre Hz, width Hz) for a note at `base`. */
function formant(base: number, count: number, formants: readonly [number, number][]): number[] {
  return Array.from({ length: count }, (_, i) => {
    const f = (i + 1) * base;
    let a = 0;
    for (const [c, w] of formants) a += Math.exp(-(((f - c) / w) ** 2));
    return a / (i + 1) ** 0.3;
  });
}

function drum(
  seconds: number,
  fill: (t: number, i: number, nz: Float32Array) => number,
): Float32Array {
  const n = Math.round(seconds * RATE);
  const d = new Float32Array(n);
  const nz = noise(n, 4097);
  for (let i = 0; i < n; i++) d[i] = fill(i / RATE, i, nz);
  normalise(d);
  return d;
}

/** A one-pole low-pass over a buffer (cutoff in Hz), for darker drums. */
function lowpass(d: Float32Array, cutoff: number): Float32Array {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    y += a * (d[i]! - y);
    d[i] = y;
  }
  return d;
}

function make(
  ctx: BaseAudioContext,
  data: Float32Array,
  base: number,
  loop: [number, number] | null,
  env: Envelope,
  gain: number,
): Instrument {
  brr(data);
  const buffer = ctx.createBuffer(1, data.length, RATE);
  buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return { buffer, base, loop, env, gain };
}

const built = new WeakMap<BaseAudioContext, Record<InstrumentId, Instrument>>();

/** The instrument set for a context (built once per context, a few ms). */
export function instruments(ctx: BaseAudioContext): Record<InstrumentId, Instrument> {
  const hit = built.get(ctx);
  if (hit) return hit;
  // strings and choir: 0.5 s loops, 131 cycles ≈ C4 (262 Hz), three players a cycle apart
  const STR_BASE = 262;
  const strings = ensemble(131, 0.5, sawHarmonics(24, 7), [-1, 0, 1]);
  const choir = ensemble(
    131,
    0.5,
    formant(STR_BASE, 20, [
      [730, 160],
      [1090, 200],
      [2440, 400],
    ]),
    [-1, 0, 1],
  );
  const brass = morphWave(250, sawHarmonics(18, 2), sawHarmonics(18, 6), 0.09, 0.08);
  const bass = morphWave(
    125,
    [1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.12],
    [1, 0.35, 0.12, 0.05, 0.02],
    0.25,
    0.06,
  );
  const flute = morphWave(500, [1, 0.3, 0.15], [1, 0.2, 0.06], 0.1, 0.06, 0.25);
  const set: Record<InstrumentId, Instrument> = {
    strings: make(
      ctx,
      strings,
      STR_BASE,
      [0, 0.5],
      { attack: 0.22, decay: 0.4, sustain: 0.85, release: 0.6 },
      0.55,
    ),
    choir: make(
      ctx,
      choir,
      STR_BASE,
      [0, 0.5],
      { attack: 0.35, decay: 0.5, sustain: 0.9, release: 0.8 },
      0.5,
    ),
    brass: make(
      ctx,
      brass.data,
      250,
      brass.loop,
      { attack: 0.03, decay: 0.25, sustain: 0.7, release: 0.18 },
      0.5,
    ),
    bass: make(
      ctx,
      bass.data,
      125,
      bass.loop,
      { attack: 0.005, decay: 0.35, sustain: 0.55, release: 0.12 },
      0.85,
    ),
    flute: make(
      ctx,
      flute.data,
      500,
      flute.loop,
      { attack: 0.06, decay: 0.3, sustain: 0.85, release: 0.25 },
      0.42,
    ),
    harp: make(
      ctx,
      pluck(250, 1.8, 0.996),
      250,
      null,
      { attack: 0.002, decay: 2, sustain: 1, release: 0.4 },
      0.5,
    ),
    timpani: make(
      ctx,
      drum(1.3, (t, _i, nz) => {
        const f = 125 * (1 + 0.04 * Math.exp(-t * 20));
        const body = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 1.5 * t);
        return body * Math.exp(-t * 3.2) + nz[_i]! * 0.3 * Math.exp(-t * 40);
      }),
      125,
      null,
      { attack: 0.002, decay: 2, sustain: 1, release: 0.3 },
      0.8,
    ),
    kick: make(
      ctx,
      drum(0.4, (t) => {
        // phase of a sweep 130 → 45 Hz
        const ph = 45 * t + (85 / 22) * (1 - Math.exp(-t * 22));
        return Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9);
      }),
      0,
      null,
      { attack: 0.001, decay: 2, sustain: 1, release: 0.05 },
      0.9,
    ),
    snare: make(
      ctx,
      lowpass(
        drum(
          0.3,
          (t, i, nz) =>
            nz[i]! * Math.exp(-t * 16) + 0.6 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 28),
        ),
        6000,
      ),
      0,
      null,
      { attack: 0.001, decay: 2, sustain: 1, release: 0.05 },
      0.55,
    ),
    hat: make(
      ctx,
      drum(0.08, (t, i, nz) => (nz[i]! - (nz[i - 1] ?? 0)) * Math.exp(-t * 70)),
      0,
      null,
      { attack: 0.001, decay: 2, sustain: 1, release: 0.03 },
      0.25,
    ),
    crash: make(
      ctx,
      drum(1.8, (t, i, nz) => (nz[i]! - (nz[i - 1] ?? 0)) * 0.7 * Math.exp(-t * 2.4)),
      0,
      null,
      { attack: 0.002, decay: 3, sustain: 1, release: 0.3 },
      0.3,
    ),
  };
  built.set(ctx, set);
  return set;
}

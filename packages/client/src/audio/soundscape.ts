import { PROCESS_KINDS, type ProcessCounts, type ProcessKind } from '@mudders/shared';

/**
 * The process soundscape (§8b): looping chip layers under the one-shot sound effects whose
 * volume follows how much of each process the world holds right now, so a forest fire sounds
 * big and a lone ember barely ticks. Every layer is synthesised here from square, triangle and
 * LFSR noise (no samples); a seeded generator makes each loop the same on every device.
 *
 * - burning: a crackle of noise pops over a low sample-and-hold rumble
 * - boiling: pulse-wave bubbles sweeping up over a deep triangle throb (lava, magma)
 * - flowing: rising triangle plinks over a soft hiss (liquid on the move)
 * - gassing: a wavering hiss (gas clouds)
 * - quenching: sizzling spurts (steam where liquid meets heat; fed by the sim when it has one)
 *
 * Licence: CC0-1.0, Mudders contributors; original, synthesised by the code below (no samples).
 * The layers live in code rather than as `audio.*` items because they are loops driven by world
 * state, not patches fired by events.
 */

const RATE = 44100;

/** Count at which a layer reaches full volume; louder grows as the square root below that. */
export const PROCESS_REF: Readonly<ProcessCounts> = {
  burning: 260,
  boiling: 220,
  flowing: 24,
  gassing: 9000,
  quenching: 12,
};

/** Loudest each layer plays (before the sfx volume). */
const LAYER_GAIN: Readonly<ProcessCounts> = {
  burning: 0.5,
  boiling: 0.42,
  flowing: 0.3,
  gassing: 0.16,
  quenching: 0.32,
};

/** Below this level a layer is silent (one burning pixel should not hum forever). */
const FLOOR = 0.1;
/** Fade time constants in seconds: quick to swell, slow to die away. */
const RISE = 0.18;
const FALL = 0.7;

/** 0–1 per process from raw counts. */
export function processLevels(c: Partial<ProcessCounts>): ProcessCounts {
  const out = { burning: 0, boiling: 0, flowing: 0, gassing: 0, quenching: 0 };
  for (const k of PROCESS_KINDS) {
    const v = c[k] ?? 0;
    const l = v > 0 ? Math.min(1, Math.sqrt(v / PROCESS_REF[k])) : 0;
    out[k] = l < FLOOR ? 0 : l;
  }
  return out;
}

/** xorshift32 in [0, 1): the loops are generated, not random, so they repeat exactly. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Volume in hard steps, like a chip's 4-bit envelope. */
const q16 = (v: number) => Math.round(v * 15) / 15;

/** Samples per 1/60 s chip frame. */
const FRAME = Math.round(RATE / 60);

function crackle(n: number): Float32Array {
  const d = new Float32Array(n);
  const r = rng(0x5eed01);
  // rumble: sample-and-hold noise at a low clock (a chip noise channel on a long period), its
  // volume stepping each frame
  let hold = 0;
  let amp = 0.5;
  for (let i = 0; i < n; i++) {
    if (i % FRAME === 0) amp = q16(0.35 + r() * 0.5);
    if (i % 22 === 0) hold = r() < 0.5 ? -1 : 1;
    d[i] = hold * 0.13 * amp;
  }
  // pops: short bursts of full-rate noise at uneven gaps, mostly small, now and then a snap
  for (let t = 0; t < n;) {
    t += 120 + Math.floor(r() * r() * 2600);
    const big = r() < 0.07;
    const len = big ? 300 + Math.floor(r() * 500) : 20 + Math.floor(r() * 180);
    const a = big ? 0.9 : 0.15 + r() * r() * 0.7;
    for (let k = 0; k < len && t + k < n; k++) {
      const env = q16((1 - k / len) ** 2);
      d[t + k]! += (r() < 0.5 ? -a : a) * env;
    }
  }
  return d;
}

function boil(n: number): Float32Array {
  const d = new Float32Array(n);
  const r = rng(0x5eed02);
  // deep throb: a triangle at 41 Hz whose volume wobbles in frame steps
  let amp = 0.5;
  for (let i = 0; i < n; i++) {
    if (i % FRAME === 0) amp = q16(0.5 + 0.5 * Math.sin((i / RATE) * 2 * Math.PI * 0.7) * 0.6);
    const ph = ((i * 41) / RATE) % 1;
    d[i] = (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4) * 0.2 * amp;
  }
  // bubbles: 25% pulse blips sweeping up an octave or so, the pitch stepping every 128 samples
  for (let t = 0; t < n;) {
    t += 1800 + Math.floor(r() * 8000);
    const len = 1600 + Math.floor(r() * 2800);
    const f0 = 70 + r() * 110;
    const f1 = f0 * (1.6 + r() * 1.2);
    const a = 0.25 + r() * 0.45;
    let ph = 0;
    let f = f0;
    for (let k = 0; k < len && t + k < n; k++) {
      if (k % 128 === 0) f = f0 * (f1 / f0) ** (k / len);
      ph = (ph + f / RATE) % 1;
      const env = q16(k < 200 ? k / 200 : (1 - k / len) ** 1.5);
      d[t + k]! += (ph < 0.25 ? a : -a * 0.33) * env;
    }
  }
  return d;
}

function trickle(n: number): Float32Array {
  const d = new Float32Array(n);
  const r = rng(0x5eed03);
  // a soft running hiss underneath, wavering per frame
  let amp = 0.5;
  for (let i = 0; i < n; i++) {
    if (i % FRAME === 0) amp = q16(0.3 + r() * 0.4);
    if (i % 3 === 0) d[i] = (r() < 0.5 ? -1 : 1) * 0.07 * amp;
    else d[i] = d[i - 1]!;
  }
  // plinks: short triangle drops whose pitch rises, at uneven gaps
  for (let t = 0; t < n;) {
    t += 500 + Math.floor(r() * 2400);
    const len = 350 + Math.floor(r() * 900);
    const f0 = 420 + r() * 900;
    const f1 = f0 * (1.3 + r() * 0.6);
    const a = 0.15 + r() * 0.4;
    let ph = 0;
    for (let k = 0; k < len && t + k < n; k++) {
      const f = f0 * (f1 / f0) ** (Math.floor(k / 64) / (len / 64));
      ph = (ph + f / RATE) % 1;
      const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
      d[t + k]! += tri * a * q16(1 - k / len);
    }
  }
  return d;
}

function hiss(n: number): Float32Array {
  const d = new Float32Array(n);
  const r = rng(0x5eed04);
  let amp = 0.5;
  let hold = 0;
  for (let i = 0; i < n; i++) {
    // a slow swell with a little flutter, in frame steps
    if (i % FRAME === 0) {
      const swell = 0.6 + 0.4 * Math.sin((i / RATE) * 2 * Math.PI * 0.45);
      amp = q16(swell * (0.8 + r() * 0.2));
    }
    if (i % 2 === 0) hold = r() < 0.5 ? -1 : 1;
    d[i] = hold * 0.5 * amp;
  }
  return d;
}

function sizzle(n: number): Float32Array {
  const d = new Float32Array(n);
  const r = rng(0x5eed05);
  for (let t = 0; t < n;) {
    const len = 1500 + Math.floor(r() * 7000);
    const a = 0.35 + r() * 0.45;
    for (let k = 0; k < len && t + k < n; k++) {
      // spits inside each spurt: the volume jumps every 512 samples
      const env = q16(k < 300 ? k / 300 : (1 - k / len) ** 2) * (0.6 + 0.4 * (((t + k) >> 9) & 1));
      d[t + k] = (r() < 0.5 ? -a : a) * env;
    }
    t += len + Math.floor(r() * 4000);
  }
  return d;
}

/** Loop lengths differ so the layers never fall into step with each other. */
const LAYERS: Record<ProcessKind, { seconds: number; make: (n: number) => Float32Array }> = {
  burning: { seconds: 3.1, make: crackle },
  boiling: { seconds: 3.7, make: boil },
  flowing: { seconds: 2.9, make: trickle },
  gassing: { seconds: 4.3, make: hiss },
  quenching: { seconds: 3.3, make: sizzle },
};

/** One layer's loop, as raw samples (tests and previews). */
export function layerSamples(kind: ProcessKind): Float32Array {
  const l = LAYERS[kind];
  return l.make(Math.round(l.seconds * RATE));
}

/**
 * The live layers on one audio context. `set` takes 0–1 levels and fades each layer toward its
 * level from context time `at`; layers start on first use and then loop for good (silent loops
 * cost next to nothing). Works on an `OfflineAudioContext` too (captures, previews).
 */
export class Soundscape {
  private readonly gains = new Map<ProcessKind, GainNode>();
  private readonly levels: ProcessCounts = {
    burning: 0,
    boiling: 0,
    flowing: 0,
    gassing: 0,
    quenching: 0,
  };

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
  ) {}

  set(levels: Readonly<ProcessCounts>, at: number = this.ctx.currentTime): void {
    for (const k of PROCESS_KINDS) {
      const l = levels[k];
      const was = this.levels[k];
      if (Math.abs(l - was) < 0.02 && !(l === 0 && was !== 0)) continue;
      this.levels[k] = l;
      const g = this.gains.get(k) ?? (l > 0 ? this.start(k, at) : undefined);
      if (!g) continue;
      g.gain.setTargetAtTime(l * LAYER_GAIN[k], at, l > was ? RISE : FALL);
    }
  }

  /** Fade everything out (leaving a match). */
  silence(at: number = this.ctx.currentTime): void {
    this.set({ burning: 0, boiling: 0, flowing: 0, gassing: 0, quenching: 0 }, at);
  }

  private start(kind: ProcessKind, at: number): GainNode {
    const ctx = this.ctx;
    const data = layerSamples(kind);
    const buf = ctx.createBuffer(1, data.length, RATE);
    buf.getChannelData(0).set(data);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    src.connect(g);
    g.connect(this.out);
    // each layer starts part-way into its loop so two matches do not open identically
    src.start(at, (at * 0.37) % LAYERS[kind].seconds);
    this.gains.set(kind, g);
    return g;
  }
}

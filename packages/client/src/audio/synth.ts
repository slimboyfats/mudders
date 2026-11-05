import type { SynthVoice } from '@mudders/shared';

/**
 * Chip synth for sound effects (§8b): each voice is one oscillator (square, pulse, triangle, saw)
 * or LFSR noise channel, with its pitch and volume changed in 60 Hz steps like a 1980s sound chip
 * (no smooth ramps), plus arpeggio and vibrato. Works on an `AudioContext` and on an
 * `OfflineAudioContext` (previews, tests), and uses no randomness, so a patch always sounds the same.
 */

const STEP = 1 / 60;
const NOISE_RATE = 44100;

/** Per-sound scaling: pitch multiplier, time stretch and gain. */
export interface PlayScale {
  pitch: number;
  time: number;
  gain: number;
}

export const UNIT: PlayScale = { pitch: 1, time: 1, gain: 1 };

/** Bigger blasts are lower, longer and a little louder (patch `radiusRef`). */
export function radiusScale(radius: number, ref: number): PlayScale {
  if (ref <= 0 || radius <= 0) return UNIT;
  const k = radius / ref;
  return {
    pitch: Math.min(2, Math.max(0.5, k ** -0.35)),
    time: Math.min(2.2, Math.max(0.6, k ** 0.4)),
    gain: Math.min(1.2, Math.max(0.5, 0.5 + k * 0.5)),
  };
}

/** Length of a voice in seconds (delay excluded). */
export function voiceLength(v: SynthVoice): number {
  return v.attack + v.hold + v.release;
}

/** Length of a whole patch in seconds. */
export function patchLength(voices: readonly SynthVoice[], scale: PlayScale = UNIT): number {
  let end = 0;
  for (const v of voices) end = Math.max(end, (v.delay + voiceLength(v)) * scale.time);
  return end;
}

const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave | AudioBuffer>>();

function cache(ctx: BaseAudioContext): Map<string, PeriodicWave | AudioBuffer> {
  let m = waveCache.get(ctx);
  if (!m) {
    m = new Map();
    waveCache.set(ctx, m);
  }
  return m;
}

/** Band-limited pulse wave with the given duty cycle (Fourier series, 32 harmonics). */
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const key = `pulse${duty}`;
  const c = cache(ctx);
  const hit = c.get(key);
  if (hit instanceof PeriodicWave) return hit;
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    real[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * duty);
    imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * duty));
  }
  const w = ctx.createPeriodicWave(real, imag);
  c.set(key, w);
  return w;
}

/**
 * 15-bit LFSR noise like a chip's noise channel: `short` taps bit 6 for the metallic 93-step
 * sequence, otherwise bit 1 for the long hiss. One LFSR step per sample at 44.1 kHz.
 */
function noiseBuffer(ctx: BaseAudioContext, short: boolean): AudioBuffer {
  const key = short ? 'metal' : 'noise';
  const c = cache(ctx);
  const hit = c.get(key);
  if (hit instanceof AudioBuffer) return hit;
  const len = short ? 93 * 64 : 32767;
  const buf = ctx.createBuffer(1, len, NOISE_RATE);
  const d = buf.getChannelData(0);
  let reg = 1;
  for (let i = 0; i < len; i++) {
    const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
    reg = (reg >> 1) | (bit << 14);
    d[i] = reg & 1 ? 0.8 : -0.8;
  }
  c.set(key, buf);
  return buf;
}

/** Pitch of a voice at `t` seconds into it, in Hz (stepped sweep + arpeggio + vibrato). */
export function voicePitch(v: SynthVoice, t: number, scale: PlayScale): number {
  const len = voiceLength(v) * scale.time;
  const k = len > 0 ? Math.min(1, t / len) : 0;
  const to = v.to ?? v.freq;
  let f = v.freq * (to / v.freq) ** k * scale.pitch;
  if (v.arp && v.arp.length > 0) {
    const i = Math.floor(t / (v.arpRate * scale.time)) % v.arp.length;
    f *= 2 ** (v.arp[i]! / 12);
  }
  if (v.vibrato) f *= 2 ** ((Math.sin(2 * Math.PI * v.vibrato.rate * t) * v.vibrato.depth) / 12);
  return f;
}

/** Volume envelope of a voice at `t` seconds into it (attack, hold, release; 0 after). */
export function voiceGain(v: SynthVoice, t: number, scale: PlayScale): number {
  const a = v.attack * scale.time;
  const h = v.hold * scale.time;
  const r = v.release * scale.time;
  if (t < 0) return 0;
  if (t < a) return (t / a) * v.volume;
  if (t < a + h) return v.volume;
  if (t < a + h + r) return v.volume * (1 - (t - a - h) / r) ** 2;
  return 0;
}

/**
 * Schedule a patch at context time `at` into `out`. Returns the end time. Pitch and volume are set
 * once per 1/60 s step.
 */
export function playVoices(
  ctx: BaseAudioContext,
  out: AudioNode,
  voices: readonly SynthVoice[],
  at: number,
  scale: PlayScale = UNIT,
): number {
  let end = at;
  for (const v of voices) {
    const start = at + v.delay * scale.time;
    const len = voiceLength(v) * scale.time;
    const stop = start + len + STEP;
    end = Math.max(end, stop);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    let src: AudioScheduledSourceNode;
    let freqParam: AudioParam;
    let toParam: (f: number) => number;
    if (v.wave === 'noise' || v.wave === 'metal') {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, v.wave === 'metal');
      s.loop = true;
      src = s;
      freqParam = s.playbackRate;
      toParam = (f) => Math.min(16, Math.max(0.002, (f * 16) / NOISE_RATE));
    } else {
      const o = ctx.createOscillator();
      if (v.wave === 'pulse25') o.setPeriodicWave(pulseWave(ctx, 0.25));
      else if (v.wave === 'pulse12') o.setPeriodicWave(pulseWave(ctx, 0.125));
      else o.type = v.wave === 'saw' ? 'sawtooth' : v.wave;
      src = o;
      freqParam = o.frequency;
      toParam = (f) => Math.min(20000, Math.max(10, f));
    }
    for (let t = 0; t <= len; t += STEP) {
      freqParam.setValueAtTime(toParam(voicePitch(v, t, scale)), start + t);
      g.gain.setValueAtTime(voiceGain(v, t, scale) * scale.gain * 0.5, start + t);
    }
    g.gain.setValueAtTime(0, start + len);
    src.connect(g);
    g.connect(out);
    src.start(start);
    src.stop(stop);
    src.onended = () => g.disconnect();
  }
  return end;
}

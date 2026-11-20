import type { Tension } from '../tension';
import { instruments, type Instrument, type InstrumentId } from './instruments';
import type { Note, Song, Track } from './songs';

/**
 * Live SNES-style music (§8b, §7.2): a sequencer that plays a song's notes through sampled-chip
 * instruments as it goes, with the console's signature echo (a delay fed back through a low-pass)
 * and a soft overall low-pass for its gentle, interpolated top end. Each tension layer has its own
 * gain, so layers fade in and out in step with the tune; a sting starts on the next beat over the
 * music, which dips under it.
 *
 * Runs on an `AudioContext` (a timer schedules the next ~0.3 s of notes) or on an
 * `OfflineAudioContext` (`renderUntil` schedules everything up front: previews and checks).
 */
const AHEAD = 0.3;
const TICK_MS = 50;
/** Seconds after a layer was asked to be silent before its notes stop being scheduled. */
const FADE_OUT = 5;
const FADE_IN = 2;

interface Playing {
  song: Song;
  /** Context time of the song's first sixteenth. */
  start: number;
  /** Seconds per sixteenth. */
  step: number;
  /** Next loop pass and note index per track still to schedule. */
  pass: number;
  next: number[];
  /** The song's fade, one per layer (each into that layer's gain). */
  outs: GainNode[];
  tracks: AudioNode[];
}

export class SnesMusic {
  private readonly inst: Record<InstrumentId, Instrument>;
  /** The music: layers → duck → master low-pass → out. Stings bypass the duck. */
  private readonly duck: GainNode;
  private readonly sum: GainNode;
  private readonly echoIn: GainNode;
  private readonly layers: GainNode[] = [];
  /** Each layer's target (1 on, 0 off) and when it was last switched off. */
  private readonly want: number[] = [1, 0, 0];
  private readonly offAt: number[] = [-Infinity, -Infinity, -Infinity];
  private playing: Playing | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
  ) {
    this.inst = instruments(ctx);
    // the SNES's output is soft at the top: interpolated 32 kHz samples
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 11000;
    soft.Q.value = 0.5;
    soft.connect(out);
    this.sum = ctx.createGain();
    this.sum.gain.value = 0.7;
    this.sum.connect(soft);
    this.duck = ctx.createGain();
    this.duck.connect(this.sum);
    // echo: 240 ms, fed back through a low-pass, like the console's echo buffer and FIR
    this.echoIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.24;
    const fir = ctx.createBiquadFilter();
    fir.type = 'lowpass';
    fir.frequency.value = 3200;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.echoIn.connect(delay);
    delay.connect(fir);
    fir.connect(fb);
    fb.connect(delay);
    fir.connect(wet);
    wet.connect(this.sum);
    for (let i = 0; i < 3; i++) {
      const g = ctx.createGain();
      g.gain.value = this.want[i]!;
      g.connect(this.duck);
      this.layers.push(g);
    }
  }

  /** Start `song` looping at `at` (default now), replacing what played. */
  play(song: Song, at = this.ctx.currentTime + 0.05): void {
    this.stop(at);
    const outs = this.layers.map((layer) => {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + 0.4);
      g.connect(layer);
      return g;
    });
    const tracks = song.tracks.map((t) => this.trackBus(t, outs[t.layer]!));
    this.playing = {
      song,
      start: at,
      step: 60 / song.bpm / 4,
      pass: 0,
      next: song.tracks.map(() => 0),
      outs,
      tracks,
    };
    if (this.ctx instanceof AudioContext && !this.timer) {
      this.timer = setInterval(() => this.renderUntil(this.ctx.currentTime + AHEAD), TICK_MS);
    }
    this.renderUntil(this.ctx.currentTime + AHEAD);
  }

  /** Fade the song out from `at` and stop scheduling it. */
  stop(at = this.ctx.currentTime): void {
    const p = this.playing;
    if (!p) return;
    for (const g of p.outs) {
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(g.gain.value, at);
      g.gain.linearRampToValueAtTime(0, at + 0.6);
      if (this.ctx instanceof AudioContext) setTimeout(() => g.disconnect(), 2500);
    }
    this.playing = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Bring layers in (2 s) or out (5 s) for the match's tension, from `at`. */
  setTension(t: Tension, at = this.ctx.currentTime): void {
    for (let i = 1; i < 3; i++) {
      const want = t >= i ? 1 : 0;
      if (want === this.want[i]) continue;
      const g = this.layers[i]!.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(this.want[i]!, at);
      g.linearRampToValueAtTime(want, at + (want ? FADE_IN : FADE_OUT));
      this.want[i] = want;
      if (!want) this.offAt[i] = at;
    }
  }

  /** Play a sting from the next beat of the music (or now), with the music dipped under it. */
  sting(song: Song, at = this.ctx.currentTime + 0.03): number {
    const step = 60 / song.bpm / 4;
    let start = at;
    const p = this.playing;
    if (p) {
      const beat = p.step * 4;
      start = p.start + Math.ceil((at - p.start) / beat - 1e-6) * beat;
    }
    let end = start;
    const out = this.ctx.createGain();
    out.connect(this.sum);
    for (const t of song.tracks) {
      const bus = this.trackBus(t, out);
      for (const n of t.notes) end = Math.max(end, this.note(t, n, start + n.at * step, step, bus));
    }
    const d = this.duck.gain;
    d.cancelScheduledValues(start - 0.05);
    d.setValueAtTime(1, start - 0.05);
    d.linearRampToValueAtTime(0.4, start);
    d.setValueAtTime(0.4, Math.max(start, end - 0.8));
    d.linearRampToValueAtTime(1, end);
    if (this.ctx instanceof AudioContext)
      setTimeout(() => out.disconnect(), (end - this.ctx.currentTime + 1) * 1000);
    return end;
  }

  /** Schedule every note of the playing song that starts before `until`. */
  renderUntil(until: number): void {
    const p = this.playing;
    if (!p) return;
    const live = this.ctx instanceof AudioContext;
    const loopLen = p.song.length * p.step;
    for (;;) {
      const passStart = p.start + p.pass * loopLen;
      let done = true;
      p.song.tracks.forEach((t, ti) => {
        let i = p.next[ti]!;
        while (i < t.notes.length) {
          const n = t.notes[i]!;
          const at = passStart + n.at * p.step;
          if (at >= until) break;
          i++;
          // a silent layer's notes are skipped once it has faded out (live only: offline renders
          // schedule everything, the gains do the rest)
          if (live && this.want[t.layer] === 0 && at > this.offAt[t.layer]! + FADE_OUT) continue;
          this.note(t, n, at, p.step, p.tracks[ti]!);
        }
        p.next[ti] = i;
        if (i < t.notes.length) done = false;
      });
      if (!done || p.song.length === 0) return;
      // every track has scheduled this pass: on to the next
      p.pass++;
      p.next.fill(0);
      if (p.start + p.pass * loopLen >= until) return;
    }
  }

  /** A track's node: pan and echo send, into `out` (the song's fade for its layer, or a sting). */
  private trackBus(t: Track, out: GainNode): AudioNode {
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = t.pan;
    if (t.echo > 0) {
      const send = this.ctx.createGain();
      send.gain.value = t.echo;
      pan.connect(send);
      send.connect(this.echoIn);
    }
    pan.connect(out);
    return pan;
  }

  /** Schedule one note at `at`; returns when it has rung out. */
  private note(t: Track, n: Note, at: number, step: number, into: AudioNode): number {
    const ins = this.inst[t.inst];
    const src = this.ctx.createBufferSource();
    src.buffer = ins.buffer;
    if (ins.loop) {
      src.loop = true;
      src.loopStart = ins.loop[0];
      src.loopEnd = ins.loop[1];
    }
    if (ins.base > 0) src.playbackRate.value = (440 * 2 ** ((n.pitch - 69) / 12)) / ins.base;
    const e = ins.env;
    const len = n.len * step * (t.staccato ? 0.45 : 0.95);
    const attack = t.staccato ? 0.004 : e.attack;
    const release = t.staccato ? 0.06 : e.release;
    const peak = n.vel * ins.gain;
    const g = this.ctx.createGain();
    const p = g.gain;
    p.setValueAtTime(0, at);
    p.linearRampToValueAtTime(peak, at + attack);
    if (e.sustain < 1) p.setTargetAtTime(peak * e.sustain, at + attack, e.decay / 3);
    const off = at + Math.max(len, attack);
    p.setTargetAtTime(0, off, release / 4);
    const end = off + release + 0.02;
    if (t.vibrato) {
      // delayed vibrato on held notes: 5.5 Hz, coming in after a third of a second
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = this.ctx.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(0, at + 0.3);
      depth.gain.linearRampToValueAtTime(t.vibrato * 100, at + 0.7);
      lfo.connect(depth);
      depth.connect(src.detune);
      lfo.start(at);
      lfo.stop(end);
    }
    src.connect(g);
    g.connect(into);
    src.start(at);
    src.stop(end);
    src.onended = () => g.disconnect();
    return end;
  }
}

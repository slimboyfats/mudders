import type { AudioManifest, EffectEvent, ProcessCounts } from '@mudders/shared';
import { processLevels, Soundscape } from './soundscape';
import { eventScale, SfxLimiter, soundMapFrom, soundsFor } from './sounds';
import { playVoices } from './synth';

/**
 * Renders a capture's soundtrack offline (`pnpm capture --audio`): the effect events and process
 * counts the capture page saw, per sim tick, played through the game's own synth and soundscape
 * at the times their frames appear in the video (hit-stop and slow motion included).
 */
const RATE = 44100;

export interface TimelineStep {
  tick: number;
  events: EffectEvent[];
  processes: ProcessCounts;
}

export interface TimelineAudio {
  /** Sim tick shown by each video frame, in frame order. */
  frameTicks: number[];
  fps: number;
  /** The audio items (synth patches) and each weapon's fire sound, in weapon order. */
  items: AudioManifest[];
  fire: (string | undefined)[];
  /** The game's default SFX volume. */
  sfx: number;
}

/** First frame showing tick `t` or later, as seconds into the video. */
function timeOf(frameTicks: readonly number[], fps: number, t: number): number {
  let lo = 0;
  let hi = frameTicks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frameTicks[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  return lo / fps;
}

/** Mono 16-bit PCM of the whole video's sound. */
export async function renderTimeline(
  steps: readonly TimelineStep[],
  a: TimelineAudio,
): Promise<Int16Array> {
  const secs = a.frameTicks.length / a.fps + 0.05;
  const ctx = new OfflineAudioContext(1, Math.ceil(secs * RATE), RATE);
  // the same chain as the game: sfx bus into a gentle limiter
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -10;
  limit.ratio.value = 8;
  limit.connect(ctx.destination);
  const bus = ctx.createGain();
  bus.gain.value = a.sfx;
  bus.connect(limit);
  const items = new Map(a.items.map((i) => [i.id, i]));
  const map = soundMapFrom(a.items, a.fire);
  const limiter = new SfxLimiter();
  const scape = new Soundscape(ctx, bus);
  for (const s of steps) {
    const at = timeOf(a.frameTicks, a.fps, s.tick);
    if (at >= secs) break;
    scape.set(processLevels(s.processes), at);
    for (const e of s.events) {
      for (const id of soundsFor(map, e)) {
        const item = items.get(id);
        if (!item?.synth || item.bus === 'music') continue;
        if (!limiter.admit(id, item.gap, at)) continue;
        limiter.playing(
          playVoices(ctx, bus, item.synth.voices, at + 0.005, eventScale(e, item.synth.radiusRef)),
        );
      }
    }
  }
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  const out = new Int16Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = Math.round(Math.max(-1, Math.min(1, d[i]!)) * 32767);
  return out;
}

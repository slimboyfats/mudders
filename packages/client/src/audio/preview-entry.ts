import { PROCESS_KINDS, type ProcessCounts, type SynthVoice } from '@mudders/shared';
import { ModulePlayer } from './module';
import { Soundscape } from './soundscape';
import { SnesMusic } from './snes/sequencer';
import { SONGS } from './snes/songs';
import { place, playPlaced } from './spatial';
import { patchLength, playVoices, radiusScale } from './synth';
import type { Tension } from './tension';

/**
 * Headless audio preview page (`pnpm audio:preview`): renders synth patches and tracker modules
 * through the game's own audio code in an `OfflineAudioContext`, so the review clips are exactly
 * what players hear (and a broken worklet fails the check).
 */
const RATE = 44100;

function pack(buf: AudioBuffer): number[][] {
  const out: number[][] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) out.push(Array.from(buf.getChannelData(c)));
  return out;
}

const api = {
  async patch(voices: SynthVoice[], radius: number, radiusRef: number): Promise<number[][]> {
    const scale = radiusScale(radius, radiusRef);
    const secs = patchLength(voices, scale) + 0.1;
    const ctx = new OfflineAudioContext(2, Math.ceil(secs * RATE), RATE);
    playVoices(ctx, ctx.destination, voices, 0, scale);
    return pack(await ctx.startRendering());
  },
  /**
   * The process soundscape: each layer alone swelling in, holding and dying away (`seconds` per
   * layer), then all of them together.
   */
  async soundscape(seconds: number): Promise<number[][]> {
    const n = PROCESS_KINDS.length + 1;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * n * RATE), RATE);
    const scape = new Soundscape(ctx, ctx.destination);
    const zero: ProcessCounts = { burning: 0, boiling: 0, flowing: 0, gassing: 0, quenching: 0 };
    for (let i = 0; i < n; i++) {
      const at = i * seconds;
      const on = { ...zero };
      for (const k of PROCESS_KINDS) if (i === n - 1 || PROCESS_KINDS[i] === k) on[k] = 1;
      // a small fire first, then a big one
      const half = { ...zero };
      for (const k of PROCESS_KINDS) half[k] = on[k] * 0.4;
      scape.set(half, at);
      scape.set(on, at + seconds * 0.35);
      scape.set(zero, at + seconds * 0.7);
    }
    return pack(await ctx.startRendering());
  },
  async module(bytes: number[], seconds: number): Promise<number[][]> {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
    const player = await ModulePlayer.create(ctx, ctx.destination);
    // let libopenmpt finish instantiating in the worklet and take the module before rendering
    await new Promise((r) => setTimeout(r, 400));
    player.play(Uint8Array.from(bytes).buffer, true);
    await new Promise((r) => setTimeout(r, 200));
    return pack(await ctx.startRendering());
  },
  /**
   * A live SNES-style song through the game's own sequencer: `plan` is [seconds, tension] steps,
   * with stings (live song names) at times in seconds.
   */
  async live(
    song: string,
    plan: [number, Tension][],
    stings: [number, string][],
  ): Promise<number[][]> {
    const secs = plan.reduce((t, [s]) => t + s, 0) + 1;
    const ctx = new OfflineAudioContext(2, Math.ceil(secs * RATE), RATE);
    const music = new SnesMusic(ctx, ctx.destination);
    const make = SONGS[song];
    if (!make) throw new Error(`no live song ${song}`);
    const s = make();
    if (s.length > 0) {
      music.play(s, 0);
      let t = 0;
      for (const [len, tension] of plan) {
        music.setTension(tension, Math.max(0.01, t));
        t += len;
      }
      music.renderUntil(secs);
    } else {
      music.sting(s, 0.05);
    }
    for (const [at, name] of stings) {
      const st = SONGS[name];
      if (st) music.sting(st(), at);
    }
    return pack(await ctx.startRendering());
  },
  /**
   * Sound in space: the same blast across the screen from left to right, then further and further
   * off screen to the right (later, quieter, duller), for a view 400 cells wide.
   */
  async spatial(voices: SynthVoice[], radiusRef: number): Promise<number[][]> {
    const ear = { x: 400, y: 200, halfW: 200, halfH: 110 };
    const xs = [220, 400, 580, 800, 1100, 1500];
    const gap = 1.3;
    const ctx = new OfflineAudioContext(2, Math.ceil((xs.length * gap + 1) * RATE), RATE);
    const scale = radiusScale(radiusRef, radiusRef);
    xs.forEach((x, i) => {
      playPlaced(ctx, ctx.destination, voices, i * gap, scale, place(x, 200, ear));
    });
    return pack(await ctx.startRendering());
  },
};

declare global {
  interface Window {
    __muddersAudio?: typeof api;
  }
}
window.__muddersAudio = api;

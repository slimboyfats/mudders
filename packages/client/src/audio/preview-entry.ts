import type { SynthVoice } from '@mudders/shared';
import { ModulePlayer } from './module';
import { patchLength, playVoices, radiusScale } from './synth';

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
  async module(bytes: number[], seconds: number): Promise<number[][]> {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
    const player = await ModulePlayer.create(ctx, ctx.destination);
    // let libopenmpt finish instantiating in the worklet and take the module before rendering
    await new Promise((r) => setTimeout(r, 400));
    player.play(Uint8Array.from(bytes).buffer, true);
    await new Promise((r) => setTimeout(r, 200));
    return pack(await ctx.startRendering());
  },
};

declare global {
  interface Window {
    __muddersAudio?: typeof api;
  }
}
window.__muddersAudio = api;

import type { SynthVoice } from '@mudders/shared';
import { playVoices, type PlayScale } from './synth';

/**
 * Sound in space (§7.1): where an effect happens, seen from the middle of the view. Sounds pan
 * left and right with their place on screen; off screen they arrive a little late, quieter and
 * duller (high end cut), the further the more, like a blast heard over the hills.
 */
export interface Listener {
  /** View centre, map cells. */
  x: number;
  y: number;
  /** Half the view's width and height, map cells (bigger when zoomed out). */
  halfW: number;
  halfH: number;
}

export interface Placement {
  /** Stereo pan, -1 (left) … 1 (right). */
  pan: number;
  /** Seconds before the sound starts. */
  delay: number;
  /** Low-pass cutoff in Hz (≥ `OPEN` means no filter). */
  cutoff: number;
  /** Gain multiplier. */
  gain: number;
}

/** A cutoff at or above this leaves the sound unfiltered. */
export const OPEN = 16000;
/** Longest delay for a sound far off screen, seconds. */
export const MAX_DELAY = 0.3;

const CENTRE: Placement = { pan: 0, delay: 0, cutoff: OPEN + 1, gain: 1 };

/** Where a sound at map cell (x, y) sits for `l`; no listener = centre, unfiltered. */
export function place(x: number, y: number, l: Listener | null): Placement {
  if (!l || l.halfW <= 0 || l.halfH <= 0) return CENTRE;
  const dx = (x - l.x) / l.halfW;
  const dy = (y - l.y) / l.halfH;
  // on screen: pan follows the place, kept off the hard edges; off screen: hard-ish to that side
  const pan = Math.max(-0.85, Math.min(0.85, dx * 0.75));
  // how far outside the view, in view half-sizes (0 on screen)
  const off = Math.max(0, Math.abs(dx) - 1) + Math.max(0, Math.abs(dy) - 1) * 0.5;
  if (off <= 0) return { pan, delay: 0, cutoff: OPEN + 1, gain: 1 };
  return {
    pan,
    delay: Math.min(MAX_DELAY, off * 0.1),
    cutoff: Math.max(600, 9000 / (1 + off * 2.5)),
    gain: Math.max(0.35, 1 / (1 + off * 0.5)),
  };
}

/**
 * Schedule a patch at `at` placed in space: a stereo panner, a low-pass when far, the delay and
 * the gain. Returns the end time; the per-sound nodes are let go once it has rung out.
 */
export function playPlaced(
  ctx: BaseAudioContext,
  out: AudioNode,
  voices: readonly SynthVoice[],
  at: number,
  scale: PlayScale,
  p: Placement,
): number {
  const pan = ctx.createStereoPanner();
  pan.pan.value = p.pan;
  let into: AudioNode = pan;
  let filter: BiquadFilterNode | null = null;
  if (p.cutoff < OPEN) {
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.cutoff;
    filter.connect(pan);
    into = filter;
  }
  pan.connect(out);
  const end = playVoices(ctx, into, voices, at + p.delay, { ...scale, gain: scale.gain * p.gain });
  if (ctx instanceof AudioContext) {
    setTimeout(
      () => {
        pan.disconnect();
        filter?.disconnect();
      },
      (end - ctx.currentTime + 0.2) * 1000,
    );
  }
  return end;
}

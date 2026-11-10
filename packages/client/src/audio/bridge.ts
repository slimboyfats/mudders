import type { EffectEvent, ProcessCounts } from '@mudders/shared';
import type { PlayScale } from './synth';

/**
 * The always-loaded side of audio (§8b): a few functions the UI calls, with no audio code behind
 * them until the first tap or key press. That gesture loads `engine.ts` (synth, content, module
 * player) and unlocks the AudioContext, which mobile browsers only allow from a user gesture.
 */
export interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

export interface Engine {
  unlock(): void;
  setSettings(s: AudioSettings): void;
  music(id: string | null): void;
  play(id: string, scale?: PlayScale): void;
  events(events: readonly EffectEvent[]): void;
  /** How much is burning, boiling, flowing, gassing, quenching now; null fades it all out. */
  processes(counts: Readonly<Partial<ProcessCounts>> | null): void;
}

let engine: Engine | null = null;
let loading = false;
let wantMusic: string | null = null;
let settings: AudioSettings = { music: 0.6, sfx: 0.8, muted: false };

export function setAudioSettings(s: AudioSettings): void {
  settings = s;
  engine?.setSettings(s);
}

/** The tune for the current screen (`audio.*` module item), or null for silence. */
export function setMusic(id: string | null): void {
  wantMusic = id;
  engine?.music(id);
}

/** A one-shot sound by id (UI sounds). Dropped silently before audio is unlocked. */
export function sfx(id: string): void {
  engine?.play(id);
}

/** Effect events from a render snapshot: the engine picks the sounds. */
export function effectSounds(events: readonly EffectEvent[]): void {
  if (events.length > 0) engine?.events(events);
}

/**
 * The world's ongoing processes (the soundscape's input): call as often as every snapshot with
 * raw counts; `null` when the match goes away. Any source can feed it (the renderer's meter
 * today, sim counters later).
 */
export function processSounds(counts: Readonly<Partial<ProcessCounts>> | null): void {
  engine?.processes(counts);
}

function gesture(e: Event): void {
  if (engine) {
    engine.unlock();
  } else if (!loading) {
    loading = true;
    void import('./engine').then((m) => {
      engine = m.createEngine();
      engine.setSettings(settings);
      engine.unlock();
      engine.music(wantMusic);
    });
  }
  // buttons click (after the engine has loaded)
  const t = e.target;
  if (e.type === 'click' && t instanceof Element && t.closest('button, a.primary, a.secondary')) {
    sfx('audio.ui-click');
  }
}

/** Listen for the gestures that unlock audio (and give buttons their click). */
export function installAudio(): void {
  for (const type of ['pointerdown', 'keydown', 'click']) {
    window.addEventListener(type, gesture, { capture: true, passive: true });
  }
}

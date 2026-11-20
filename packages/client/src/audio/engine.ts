import { loadContent } from '@mudders/content';
import type { ResolvedContent } from '@mudders/sim';
import type { AudioManifest, EffectEvent, ProcessCounts } from '@mudders/shared';
import type { AudioSettings, Engine } from './bridge';
import type { ModulePlayer } from './module';
import { place, playPlaced, type Listener } from './spatial';
import { processLevels, Soundscape } from './soundscape';
import { eventScale, SfxLimiter, soundMap, soundsFor, type SoundMap } from './sounds';
import { SnesMusic } from './snes/sequencer';
import { SONGS } from './snes/songs';
import { playVoices, UNIT, type PlayScale } from './synth';
import type { Tension } from './tension';

/** Module files of every audio item, by `audio.<name>/<file>` (`core/audio/<name>/<file>`). */
const MODULE_URLS: Record<string, string> = (() => {
  const files = import.meta.glob('../../../content/core/audio/*/*.{mod,xm,s3m,it}', {
    query: '?url',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(files)) {
    const m = /\/audio\/([a-z0-9-]+)\/([a-z0-9-]+\.[a-z0-9]+)$/.exec(path);
    if (m) out[`audio.${m[1]}/${m[2]}`] = url;
  }
  return out;
})();

class AudioEngine implements Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<AudioManifest['bus'], GainNode>();
  private readonly items = new Map<string, AudioManifest>();
  private readonly map: SoundMap;
  private readonly limit = new SfxLimiter();
  private settings: AudioSettings = { music: 0.6, sfx: 0.8, muted: false };
  private player: Promise<ModulePlayer> | null = null;
  private playing: string | null = null;
  private want: string | null = null;
  private readonly bytes = new Map<string, Promise<ArrayBuffer>>();
  private scape: Soundscape | null = null;
  /** The live SNES-style sequencer (songs with `live`, and stings), made on first use. */
  private snes: SnesMusic | null = null;
  private tension: Tension = 0;
  private listener: Listener | null = null;

  constructor(content: ResolvedContent) {
    for (const a of content.list('audio')) this.items.set(a.id, a);
    this.map = soundMap(content);
    document.addEventListener('visibilitychange', () => {
      // battery and courtesy (§8a): no audio from a hidden tab
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  unlock(): void {
    if (!this.ctx) {
      // iOS: follow the ring/silent switch, like other game sounds (where the platform exposes it)
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'ambient';
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const master = ctx.createGain();
      // a gentle limiter so stacked blasts don't clip
      const limit = ctx.createDynamicsCompressor();
      limit.threshold.value = -10;
      limit.ratio.value = 8;
      master.connect(limit);
      limit.connect(ctx.destination);
      for (const bus of ['sfx', 'music', 'ui'] as const) {
        const g = ctx.createGain();
        g.connect(master);
        this.buses.set(bus, g);
      }
      this.ctx = ctx;
      this.master = master;
      this.scape = new Soundscape(ctx, this.buses.get('sfx')!);
      this.applySettings();
      this.music(this.want);
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
  }

  setSettings(s: AudioSettings): void {
    this.settings = s;
    this.applySettings();
  }

  private applySettings(): void {
    if (!this.master) return;
    const s = this.settings;
    this.master.gain.value = s.muted ? 0 : 1;
    this.buses.get('music')!.gain.value = s.music * 0.5;
    this.buses.get('sfx')!.gain.value = s.sfx;
    this.buses.get('ui')!.gain.value = s.sfx * 0.7;
  }

  private fetchModule(id: string, file: string): Promise<ArrayBuffer> {
    const key = `${id}/${file}`;
    let b = this.bytes.get(key);
    if (!b) {
      const url = MODULE_URLS[key];
      b = url ? fetch(url).then((r) => r.arrayBuffer()) : Promise.reject(new Error(`no ${key}`));
      this.bytes.set(key, b);
    }
    return b;
  }

  private live(): SnesMusic | null {
    if (!this.ctx) return null;
    if (!this.snes) {
      this.snes = new SnesMusic(this.ctx, this.buses.get('music')!);
      this.snes.setTension(this.tension);
    }
    return this.snes;
  }

  music(id: string | null): void {
    this.want = id;
    const ctx = this.ctx;
    if (!ctx || id === this.playing) return;
    this.playing = id;
    const item = id ? this.items.get(id) : undefined;
    const song = item?.live ? SONGS[item.live.song] : undefined;
    if (song) {
      // live SNES-style song: the module player falls quiet, the sequencer takes over
      void this.player?.then((p) => p.stop());
      this.live()?.play(song());
      document.documentElement.dataset.music = id ?? '';
      return;
    }
    this.snes?.stop();
    this.stream(ctx, this.buses.get('music')!, id, item);
  }

  /** Stream a tracker module through the worklet player. */
  private stream(
    ctx: AudioContext,
    out: GainNode,
    id: string | null,
    item: AudioManifest | undefined,
  ): void {
    this.player ??= import('./module').then((m) => m.ModulePlayer.create(ctx, out));
    void this.player
      .then(async (p) => {
        if (!item?.module || !id) {
          p.stop();
          delete document.documentElement.dataset.music;
          return;
        }
        const bytes = await this.fetchModule(id, item.module.file);
        if (this.playing !== id) return;
        p.play(bytes, item.module.loop);
        // a marker for smoke tests and debugging: which tune is playing
        document.documentElement.dataset.music = id;
      })
      .catch((e: unknown) => {
        // music is a nicety: a player that fails to load leaves the game silent, not broken
        console.warn('music unavailable', e);
        this.playing = null;
      });
  }

  setTension(t: Tension): void {
    this.tension = t;
    this.snes?.setTension(t);
  }

  setListener(l: Listener | null): void {
    this.listener = l;
  }

  play(id: string, scale: PlayScale = UNIT, at?: { x: number; y: number }): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.settings.muted) return;
    const a = this.items.get(id);
    const now = ctx.currentTime;
    const sting = a?.live ? SONGS[a.live.song] : undefined;
    if (a && sting) {
      // a live sting: on the next beat of the music, which dips under it
      if (this.limit.admit(id, a.gap, now)) this.live()?.sting(sting());
      return;
    }
    if (!a?.synth) return;
    if (!this.limit.admit(id, a.gap, now)) return;
    const bus = this.buses.get(a.bus)!;
    if (!at || a.bus !== 'sfx') {
      this.limit.playing(playVoices(ctx, bus, a.synth.voices, now + 0.005, scale));
      return;
    }
    // sound in space (§7.1): pan by place on screen; far off screen later, quieter and duller
    const p = place(at.x, at.y, this.listener);
    this.limit.playing(playPlaced(ctx, bus, a.synth.voices, now + 0.005, scale, p));
  }

  processes(counts: Readonly<Partial<ProcessCounts>> | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.scape) return;
    if (counts) this.scape.set(processLevels(counts), ctx.currentTime);
    else this.scape.silence(ctx.currentTime);
  }

  events(events: readonly EffectEvent[]): void {
    for (const e of events) {
      for (const id of soundsFor(this.map, e)) {
        const a = this.items.get(id);
        if (!a) continue;
        this.play(id, a.synth ? eventScale(e, a.synth.radiusRef) : UNIT, e);
      }
    }
  }
}

export function createEngine(): Engine {
  return new AudioEngine(loadContent());
}

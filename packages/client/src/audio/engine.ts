import { loadContent } from '@mudders/content';
import type { ResolvedContent } from '@mudders/sim';
import { DAMAGE_TYPES, type AudioManifest, type EffectEvent } from '@mudders/shared';
import type { AudioSettings, Engine } from './bridge';
import type { ModulePlayer } from './module';
import { playVoices, radiusScale, UNIT, type PlayScale } from './synth';

/** Module files of every audio item, by item id (`core/audio/<name>/<file>` → `audio.<name>`). */
const MODULE_URLS: Record<string, string> = (() => {
  const files = import.meta.glob('../../../content/core/audio/*/*.{mod,xm,s3m,it}', {
    query: '?url',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(files)) {
    const m = /\/audio\/([a-z0-9-]+)\//.exec(path);
    if (m) out[`audio.${m[1]}`] = url;
  }
  return out;
})();

/** At most this many SFX voices sound at once; more are dropped (a big chain stays readable). */
const MAX_SOUNDS = 12;

/** Which sounds an effect event plays: per event type, generic ids and ids per damage type. */
export interface SoundMap {
  generic: Record<string, string[]>;
  byDamage: Record<string, string[]>;
  /** Fire sound per weapon index (the sim's weapon order: ids sorted). */
  fire: string[];
}

export function soundMap(content: ResolvedContent): SoundMap {
  const generic: Record<string, string[]> = {};
  const byDamage: Record<string, string[]> = {};
  for (const a of content.list('audio')) {
    for (const on of a.on) {
      const key = on.damageType ? `${on.event}:${on.damageType}` : on.event;
      const into = on.damageType ? byDamage : generic;
      (into[key] ??= []).push(a.id);
    }
  }
  const def = generic.muzzle?.[0] ?? 'audio.fire';
  const fire = content.list('weapon').map((w) => w.audio?.fire ?? def);
  return { generic, byDamage, fire };
}

/** The sound ids an event plays: damage-type-specific ones win over the event's generic ones. */
export function soundsFor(map: SoundMap, e: EffectEvent): readonly string[] {
  if (e.type === 'muzzle') {
    const w = map.fire[e.params.weapon ?? -1];
    return w ? [w] : (map.generic.muzzle ?? []);
  }
  const dt = e.params.dt;
  if (dt !== undefined) {
    const specific = map.byDamage[`${e.type}:${DAMAGE_TYPES[dt] ?? ''}`];
    if (specific) return specific;
  }
  return map.generic[e.type] ?? [];
}

class AudioEngine implements Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<AudioManifest['bus'], GainNode>();
  private readonly items = new Map<string, AudioManifest>();
  private readonly map: SoundMap;
  private readonly lastStart = new Map<string, number>();
  private ends: number[] = [];
  private settings: AudioSettings = { music: 0.6, sfx: 0.8, muted: false };
  private player: Promise<ModulePlayer> | null = null;
  private playing: string | null = null;
  private want: string | null = null;
  private readonly bytes = new Map<string, Promise<ArrayBuffer>>();

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

  music(id: string | null): void {
    this.want = id;
    const ctx = this.ctx;
    if (!ctx || id === this.playing) return;
    this.playing = id;
    const out = this.buses.get('music')!;
    this.player ??= import('./module').then((m) => m.ModulePlayer.create(ctx, out));
    const item = id ? this.items.get(id) : undefined;
    const url = id ? MODULE_URLS[id] : undefined;
    void this.player
      .then(async (p) => {
        if (!item?.module || !url || !id) {
          p.stop();
          delete document.documentElement.dataset.music;
          return;
        }
        let b = this.bytes.get(id);
        if (!b) {
          b = fetch(url).then((r) => r.arrayBuffer());
          this.bytes.set(id, b);
        }
        const bytes = await b;
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

  play(id: string, scale: PlayScale = UNIT): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.settings.muted) return;
    const a = this.items.get(id);
    if (!a?.synth) return;
    const now = ctx.currentTime;
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < a.gap) return;
    this.ends = this.ends.filter((t) => t > now);
    if (this.ends.length >= MAX_SOUNDS) return;
    this.lastStart.set(id, now);
    this.ends.push(playVoices(ctx, this.buses.get(a.bus)!, a.synth.voices, now + 0.005, scale));
  }

  events(events: readonly EffectEvent[]): void {
    for (const e of events) {
      for (const id of soundsFor(this.map, e)) {
        const a = this.items.get(id);
        if (!a?.synth) continue;
        const scale = radiusScale(e.radius, a.synth.radiusRef);
        const strength = e.params.strength;
        this.play(
          id,
          strength === undefined ? scale : { ...scale, gain: scale.gain * Math.min(1.3, strength) },
        );
      }
    }
  }
}

export function createEngine(): Engine {
  return new AudioEngine(loadContent());
}

import { DAMAGE_TYPES, type EffectEvent } from '@mudders/shared';
import type { ResolvedContent } from '@mudders/sim';
import { radiusScale, type PlayScale } from './synth';

/** Which sounds an effect event plays: per event type, generic ids and ids per damage type. */
export interface SoundMap {
  generic: Record<string, string[]>;
  byDamage: Record<string, string[]>;
  /** Fire sound per weapon index (the sim's weapon order: ids sorted). */
  fire: string[];
}

/** The parts of an audio item the map reads (plain data, so a capture page can take it). */
export interface SoundListener {
  id: string;
  on: readonly { event: string; damageType?: string | undefined }[];
}

/** Build the map from audio items and each weapon's own fire sound (weapon order). */
export function soundMapFrom(
  audio: readonly SoundListener[],
  weaponFire: readonly (string | undefined)[],
): SoundMap {
  const generic: Record<string, string[]> = {};
  const byDamage: Record<string, string[]> = {};
  for (const a of audio) {
    for (const on of a.on) {
      const key = on.damageType ? `${on.event}:${on.damageType}` : on.event;
      const into = on.damageType ? byDamage : generic;
      (into[key] ??= []).push(a.id);
    }
  }
  const def = generic.muzzle?.[0] ?? 'audio.fire';
  const fire = weaponFire.map((f) => f ?? def);
  return { generic, byDamage, fire };
}

export function soundMap(content: ResolvedContent): SoundMap {
  return soundMapFrom(
    content.list('audio'),
    content.list('weapon').map((w) => w.audio?.fire),
  );
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

/** At most this many SFX voices sound at once; more are dropped (a big chain stays readable). */
export const MAX_SOUNDS = 12;

/** Bigger blasts sound lower and longer; a weaker hit (`strength`) is a little quieter. */
export function eventScale(e: EffectEvent, radiusRef: number): PlayScale {
  const scale = radiusScale(e.radius, radiusRef);
  const strength = e.params.strength;
  return strength === undefined ? scale : { ...scale, gain: scale.gain * Math.min(1.3, strength) };
}

/** Which sounds may start: each id waits its `gap`, and at most `MAX_SOUNDS` play at once. */
export class SfxLimiter {
  private readonly lastStart = new Map<string, number>();
  private ends: number[] = [];

  /** Whether `id` may start at `now`; if so it counts as started. */
  admit(id: string, gap: number, now: number): boolean {
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < gap) return false;
    this.ends = this.ends.filter((t) => t > now);
    if (this.ends.length >= MAX_SOUNDS) return false;
    this.lastStart.set(id, now);
    return true;
  }

  /** Record when the sound just admitted ends. */
  playing(end: number): void {
    this.ends.push(end);
  }
}

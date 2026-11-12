import type { Quality } from '../render/types';

/** Per-client cosmetic settings, persisted in localStorage (§8). Never affects the sim. */
export interface Settings {
  quality: Quality;
  /** Step the quality down by itself when frames run long (never above `quality`). */
  autoQuality: boolean;
  shake: boolean;
  /** Play the blow that decides a round in slow motion (presentation only). */
  slowmo: boolean;
  /** Each round is played at a later time of day: day, sunset, night, dawn (cosmetic). */
  dayNight: boolean;
  /** `theme.*` id the map is drawn with; cosmetic and per device. */
  theme: string;
  /** Music and sound-effect volume 0–1, and a master mute (§8a: audio is muteable). */
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  /** Size of menus and HUD (§8 accessibility: scalable UI), 0.8–1.6. */
  uiScale: number;
  /** Show the sim/render frame-time overlay (§9: budget checks on real devices). */
  perfHud: boolean;
}

const KEY = 'mudders.settings.v1';

function defaults(): Settings {
  const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const mobile = mq('(pointer: coarse)');
  return {
    quality: mobile ? 'medium' : 'high',
    autoQuality: true,
    // no screen shake for players who asked their system for less motion
    shake: !mq('(prefers-reduced-motion: reduce)'),
    slowmo: true,
    dayNight: true,
    theme: 'theme.default',
    musicVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    uiScale: 1,
    perfHud: false,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // private mode or blocked storage: defaults
  }
  return defaults();
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

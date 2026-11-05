import type { Quality } from '../render/types';

/** Per-client cosmetic settings, persisted in localStorage (§8). Never affects the sim. */
export interface Settings {
  quality: Quality;
  shake: boolean;
}

const KEY = 'mudders.settings.v1';

function defaults(): Settings {
  const mobile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return { quality: mobile ? 'medium' : 'high', shake: true };
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

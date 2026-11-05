import { useMemo } from 'react';
import { loadContent } from '@mudders/content';
import { themeChoices } from '../game/palette';
import { saveSettings, type Settings as S } from '../game/settings';
import { QUALITIES, type Quality } from '../render/types';

interface Props {
  settings: S;
  setSettings: (s: S) => void;
  onBack: () => void;
}

/** Per-device cosmetic settings (§8): never affect the sim. */
export function Settings({ settings, setSettings, onBack }: Props) {
  const themes = useMemo(() => themeChoices(loadContent()), []);
  const update = (s: S) => {
    saveSettings(s);
    setSettings(s);
  };
  return (
    <main className="setup">
      <h2>Settings</h2>
      <section className="rules">
        <label>
          Quality
          <select
            value={settings.quality}
            onChange={(e) => update({ ...settings, quality: e.target.value as Quality })}
          >
            {QUALITIES.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <label>
          Theme
          <select
            value={settings.theme}
            onChange={(e) => update({ ...settings, theme: e.target.value })}
          >
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Music
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.musicVolume}
            aria-label="Music volume"
            onChange={(e) => update({ ...settings, musicVolume: Number(e.target.value) })}
          />
        </label>
        <label>
          Sound effects
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.sfxVolume}
            aria-label="Sound effects volume"
            onChange={(e) => update({ ...settings, sfxVolume: Number(e.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.muted}
            onChange={(e) => update({ ...settings, muted: e.target.checked })}
          />
          Mute all sound
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.shake}
            onChange={(e) => update({ ...settings, shake: e.target.checked })}
          />
          Screen shake
        </label>
      </section>
      <div className="setup-actions">
        <button className="primary" onClick={onBack}>
          Done
        </button>
      </div>
    </main>
  );
}

import { saveSettings, type Settings as S } from '../game/settings';
import { QUALITIES, type Quality } from '../render/types';

interface Props {
  settings: S;
  setSettings: (s: S) => void;
  onBack: () => void;
}

/** Per-device cosmetic settings (§8): never affect the sim. */
export function Settings({ settings, setSettings, onBack }: Props) {
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

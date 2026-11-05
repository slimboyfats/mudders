import { useEffect, useState } from 'react';
import { MAX_PLAYERS, PROTOCOL_VERSION } from '@mudders/shared';
import { SIGNAL_URL } from '../config';
import { saveSettings, type Settings } from '../game/settings';
import { QUALITIES, type Quality } from '../render/types';
import type { MapSize } from './Play';

type LobbyStatus = 'checking' | 'online' | 'offline';

interface Props {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onPlay: (players: number, size: MapSize) => void;
}

function hasWebGL2(): boolean {
  return document.createElement('canvas').getContext('webgl2') !== null;
}

export function Title({ settings, setSettings, onPlay }: Props) {
  const [lobby, setLobby] = useState<LobbyStatus>('checking');
  const [webgl2] = useState(hasWebGL2);
  const [players, setPlayers] = useState(2);
  const [size, setSize] = useState<MapSize>(() =>
    Math.min(window.innerWidth, window.innerHeight) < 500 ? 'small' : 'medium',
  );

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${SIGNAL_URL}/health`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(() => setLobby('online'))
      .catch(() => {
        if (!ctrl.signal.aborted) setLobby('offline');
      });
    return () => ctrl.abort();
  }, []);

  const update = (s: Settings) => {
    saveSettings(s);
    setSettings(s);
  };

  return (
    <main className="title">
      <h1>Mudders</h1>
      <p className="tagline">Set the mud on fire.</p>
      <div className="menu">
        <button className="primary" disabled={!webgl2} onClick={() => onPlay(players, size)}>
          Local hot-seat
        </button>
        <label>
          Players
          <select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
            {Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Map
          <select value={size} onChange={(e) => setSize(e.target.value as MapSize)}>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
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
        <a className="secondary" href="#sandbox">
          Content sandbox
        </a>
      </div>
      <ul className="status">
        <li>WebGL2: {webgl2 ? 'yes' : 'no (required)'}</li>
        <li>Lobby server: {lobby}</li>
        <li>Protocol v{PROTOCOL_VERSION}</li>
      </ul>
    </main>
  );
}

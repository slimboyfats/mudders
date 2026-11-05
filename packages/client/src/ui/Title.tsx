import { useEffect, useState, useSyncExternalStore } from 'react';
import { PROTOCOL_VERSION } from '@mudders/shared';
import { SIGNAL_URL } from '../config';
import { installState, promptInstall, subscribeInstall } from '../pwa';

type LobbyStatus = 'checking' | 'online' | 'offline';

interface Props {
  onPlay: () => void;
}

function hasWebGL2(): boolean {
  return document.createElement('canvas').getContext('webgl2') !== null;
}

export function Title({ onPlay }: Props) {
  const [lobby, setLobby] = useState<LobbyStatus>('checking');
  const [webgl2] = useState(hasWebGL2);
  const install = useSyncExternalStore(subscribeInstall, installState);

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

  return (
    <main className="title">
      <h1>Mudders</h1>
      <p className="tagline">Set the mud on fire.</p>
      <div className="menu">
        <button className="primary" disabled={!webgl2} onClick={onPlay}>
          Local game
        </button>
        <a className="secondary" href="#browse" data-testid="browse">
          Browse public games
        </a>
        <a className="secondary" href="#host" data-testid="host-online">
          Host online game
        </a>
        <a className="secondary" href="#join" data-testid="join-online">
          Join online game
        </a>
        <a className="secondary" href="#direct">
          Direct game (no server)
        </a>
        {install === 'prompt' && (
          <button className="secondary" onClick={() => void promptInstall()} data-testid="install">
            Install app
          </button>
        )}
        <a className="secondary" href="#settings">
          Settings
        </a>
        <a className="secondary" href="#sandbox">
          Content sandbox
        </a>
      </div>
      {install === 'ios' && (
        <p className="install-hint">Play full screen: tap Share, then “Add to Home Screen”.</p>
      )}
      <ul className="status">
        <li>WebGL2: {webgl2 ? 'yes' : 'no (required)'}</li>
        <li>Lobby server: {lobby}</li>
        <li>Protocol v{PROTOCOL_VERSION}</li>
      </ul>
    </main>
  );
}

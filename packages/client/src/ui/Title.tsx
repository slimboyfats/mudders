import { useEffect, useState, useSyncExternalStore } from 'react';
import { PROTOCOL_VERSION } from '@mudders/shared';
import { hasUnseen } from '../changelog';
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
  const [unseen] = useState(hasUnseen);
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
      <div className="title-hero">
        <h1>Mudders</h1>
        <p className="tagline">Set the mud on fire.</p>
        <ul className="status">
          <li className={webgl2 ? 'ok' : 'bad'}>
            WebGL2 {webgl2 ? 'ready' : 'missing (required)'}
          </li>
          <li className={lobby === 'online' ? 'ok' : lobby === 'offline' ? 'bad' : ''}>
            Lobby {lobby}
          </li>
          <li>Protocol v{PROTOCOL_VERSION}</li>
        </ul>
      </div>
      <div className="menu">
        <button className="primary play" disabled={!webgl2} onClick={onPlay}>
          <span className="play-icon" aria-hidden="true">
            ▶
          </span>
          <span>
            Local game
            <small>Hot-seat and bots on this device</small>
          </span>
        </button>
        <div className="menu-group" role="group" aria-label="Online">
          <span className="menu-label">Online</span>
          <div className="menu-tiles">
            <a className="secondary tile" href="#browse" data-testid="browse">
              <span className="tile-icon" aria-hidden="true">
                ☰
              </span>
              Browse games
            </a>
            <a className="secondary tile" href="#host" data-testid="host-online">
              <span className="tile-icon" aria-hidden="true">
                ⌂
              </span>
              Host a game
            </a>
            <a className="secondary tile" href="#join" data-testid="join-online">
              <span className="tile-icon" aria-hidden="true">
                ⇢
              </span>
              Join with a code
            </a>
            <a className="secondary tile" href="#direct">
              <span className="tile-icon" aria-hidden="true">
                ⇄
              </span>
              Direct (no server)
            </a>
          </div>
        </div>
        <div className="menu-row">
          <a className="secondary chip" href="#changelog" data-testid="changelog-button">
            ★ Changelog
            {unseen && <span className="new-dot" aria-label="new" />}
          </a>
          <a className="secondary chip" href="#settings">
            ⚙ Settings
          </a>
          <a className="secondary chip" href="#sandbox">
            ✦ Content sandbox
          </a>
          <a className="secondary chip" href={`${import.meta.env.BASE_URL}docs/`}>
            ☰ Field manual
          </a>
          {install === 'prompt' && (
            <button
              className="secondary chip"
              onClick={() => void promptInstall()}
              data-testid="install"
            >
              ⤓ Install app
            </button>
          )}
        </div>
        {install === 'ios' && (
          <p className="install-hint">Play full screen: tap Share, then “Add to Home Screen”.</p>
        )}
      </div>
    </main>
  );
}

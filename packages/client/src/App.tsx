import { useEffect, useState } from 'react';
import { PROTOCOL_VERSION } from '@mudders/shared';
import { SIGNAL_URL } from './config';

type LobbyStatus = 'checking' | 'online' | 'offline';

function hasWebGL2(): boolean {
  return document.createElement('canvas').getContext('webgl2') !== null;
}

export function App() {
  const [lobby, setLobby] = useState<LobbyStatus>('checking');
  const [webgl2] = useState(hasWebGL2);

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
      <ul className="status">
        <li>WebGL2: {webgl2 ? 'yes' : 'no'}</li>
        <li>Lobby server: {lobby}</li>
        <li>Protocol v{PROTOCOL_VERSION}</li>
      </ul>
    </main>
  );
}

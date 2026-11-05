import { lazy, Suspense, useEffect, useState } from 'react';
import { loadSettings, type Settings } from './game/settings';
import { Title } from './ui/Title';
import type { MapSize } from './ui/Play';

// The match (renderer, sim, content) and the sandbox are code-split from the title screen (§9).
const Play = lazy(() => import('./ui/Play').then((m) => ({ default: m.Play })));
const Sandbox = lazy(() => import('./ui/Sandbox').then((m) => ({ default: m.Sandbox })));

type Route =
  { name: 'title' } | { name: 'play'; players: number; size: MapSize } | { name: 'sandbox' };

function fromHash(): Route {
  const h = location.hash;
  if (h.startsWith('#sandbox')) return { name: 'sandbox' };
  const m = /^#play(?:\/(\d))?(?:\/(small|medium|large))?/.exec(h);
  if (m) return { name: 'play', players: Number(m[1] ?? 2), size: (m[2] as MapSize) ?? 'medium' };
  return { name: 'title' };
}

export function App() {
  const [route, setRoute] = useState<Route>(fromHash);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    const on = () => setRoute(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (hash: string) => {
    location.hash = hash;
  };

  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      {route.name === 'title' && (
        <Title
          settings={settings}
          setSettings={setSettings}
          onPlay={(players, size) => go(`#play/${players}/${size}`)}
        />
      )}
      {route.name === 'play' && (
        <Play players={route.players} size={route.size} settings={settings} onExit={() => go('')} />
      )}
      {route.name === 'sandbox' && <Sandbox settings={settings} onExit={() => go('')} />}
    </Suspense>
  );
}

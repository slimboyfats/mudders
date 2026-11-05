import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { MAX_PLAYERS } from '@mudders/shared';
import { loadSettings, type Settings as SettingsT } from './game/settings';
import { loadSetup, type MapSize, type MatchSetup } from './game/setup';
import { Settings } from './ui/Settings';
import { Title } from './ui/Title';

// The match (renderer, sim, content), the setup screen and the sandbox are code-split (§9).
const Play = lazy(() => import('./ui/Play').then((m) => ({ default: m.Play })));
const Setup = lazy(() => import('./ui/Setup').then((m) => ({ default: m.Setup })));
const Sandbox = lazy(() => import('./ui/Sandbox').then((m) => ({ default: m.Sandbox })));

type Route =
  | { name: 'title' }
  | { name: 'setup' }
  | { name: 'settings' }
  | { name: 'play'; quick?: { players: number; size: MapSize } }
  | { name: 'sandbox' };

function fromHash(): Route {
  const h = location.hash;
  if (h.startsWith('#sandbox')) return { name: 'sandbox' };
  if (h.startsWith('#setup')) return { name: 'setup' };
  if (h.startsWith('#settings')) return { name: 'settings' };
  // #play uses the saved setup; #play/<n>/<size> is an all-human hot-seat shortcut (smoke tests)
  const m = /^#play(?:\/(\d))?(?:\/(small|medium|large))?/.exec(h);
  if (m) {
    return m[1]
      ? {
          name: 'play',
          quick: { players: Number(m[1]), size: (m[2] as MapSize | undefined) ?? 'medium' },
        }
      : { name: 'play' };
  }
  return { name: 'title' };
}

function quickSetup(base: MatchSetup, players: number, size: MapSize): MatchSetup {
  const n = Math.max(2, Math.min(MAX_PLAYERS, players));
  return {
    ...base,
    size,
    slots: Array.from({ length: MAX_PLAYERS }, (_, i) => (i < n ? 'human' : 'off')),
  };
}

export function App() {
  const [route, setRoute] = useState<Route>(fromHash);
  const [settings, setSettings] = useState<SettingsT>(loadSettings);
  const [setup, setSetup] = useState<MatchSetup>(loadSetup);

  useEffect(() => {
    const on = () => setRoute(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const playSetup = useMemo(
    () =>
      route.name === 'play' && route.quick
        ? quickSetup(setup, route.quick.players, route.quick.size)
        : setup,
    [route, setup],
  );

  const go = (hash: string) => {
    location.hash = hash;
  };

  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      {route.name === 'title' && <Title onPlay={() => go('#setup')} />}
      {route.name === 'setup' && (
        <Setup
          setup={setup}
          setSetup={setSetup}
          onStart={() => go('#play')}
          onBack={() => go('')}
        />
      )}
      {route.name === 'settings' && (
        <Settings settings={settings} setSettings={setSettings} onBack={() => go('')} />
      )}
      {route.name === 'play' && (
        <Play setup={playSetup} settings={settings} onExit={() => go('')} />
      )}
      {route.name === 'sandbox' && <Sandbox settings={settings} onExit={() => go('')} />}
    </Suspense>
  );
}

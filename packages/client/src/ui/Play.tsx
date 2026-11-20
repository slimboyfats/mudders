import { useEffect, useMemo, useState } from 'react';
import { loadContent } from '@mudders/content';
import { LocalMatch } from '../game/match';
import type { Settings } from '../game/settings';
import { toWorldOptions, type MatchSetup } from '../game/setup';
import { RemoteLocalMatch, simThread } from '../game/sim-client';
import { MatchView } from './MatchView';
import { useMatchReady } from './match-ready';

interface Props {
  setup: MatchSetup;
  settings: Settings;
  onExit: () => void;
}

/** Local match: humans share this device (hot-seat) and AI players take their own turns. */
export function Play({ setup, settings, onExit }: Props) {
  const [game, setGame] = useState(0);
  const [seed] = useState(() => (Math.random() * 0xffffffff) >>> 0);
  // where the sim runs is settled when the match starts; the switch takes hold on the next one
  const [offThread] = useState(settings.simWorker);
  const options = useMemo(
    () => toWorldOptions(setup, (seed + game * 7919) >>> 0),
    [seed, game, setup],
  );
  const match = useMemo(() => {
    const thread = offThread ? simThread() : null;
    return thread
      ? new RemoteLocalMatch(thread, loadContent(), options)
      : new LocalMatch(loadContent(), options);
  }, [options, offThread]);
  useEffect(() => (match instanceof RemoteLocalMatch ? match.hold() : undefined), [match]);
  const ready = useMatchReady(match);
  const humans = useMemo(
    () => Array.from({ length: options.players }, (_, p) => !options.bots?.[p]),
    [options],
  );
  if (!ready) return <MatchLoading />;
  return (
    <MatchView
      key={game}
      match={match}
      settings={settings}
      controls={(p) => humans[p] ?? false}
      onExit={onExit}
      onRematch={() => setGame((g) => g + 1)}
      ghost={setup.ghost !== false}
    />
  );
}

/** Shown for the moment the worker takes to build a match's world. */
export function MatchLoading() {
  return (
    <div className="match-loading" role="status">
      Building the battlefield…
    </div>
  );
}

import { useMemo, useState } from 'react';
import { loadContent } from '@mudders/content';
import { LocalMatch } from '../game/match';
import type { Settings } from '../game/settings';
import { toWorldOptions, type MatchSetup } from '../game/setup';
import { MatchView } from './MatchView';

interface Props {
  setup: MatchSetup;
  settings: Settings;
  onExit: () => void;
}

/** Local match: humans share this device (hot-seat) and AI players take their own turns. */
export function Play({ setup, settings, onExit }: Props) {
  const [game, setGame] = useState(0);
  const [seed] = useState(() => (Math.random() * 0xffffffff) >>> 0);
  const match = useMemo(
    () => new LocalMatch(loadContent(), toWorldOptions(setup, (seed + game * 7919) >>> 0)),
    [seed, game, setup],
  );
  const humans = useMemo(() => match.world.tanks.map((t) => t.bot < 0), [match]);
  return (
    <MatchView
      key={game}
      match={match}
      settings={settings}
      controls={(p) => humans[p] ?? false}
      onExit={onExit}
      onRematch={() => setGame((g) => g + 1)}
    />
  );
}

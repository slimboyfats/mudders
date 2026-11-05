import { useMemo, useState } from 'react';
import { loadContent } from '@mudders/content';
import { MAP_SIZES } from '@mudders/shared';
import { LocalMatch } from '../game/match';
import type { Settings } from '../game/settings';
import { MatchView } from './MatchView';

export type MapSize = keyof typeof MAP_SIZES;

interface Props {
  players: number;
  size: MapSize;
  settings: Settings;
  onExit: () => void;
}

/** Local hot-seat match (milestone 2): every player shares this device and takes turns. */
export function Play({ players, size, settings, onExit }: Props) {
  const [round, setRound] = useState(0);
  const [seed] = useState(() => (Math.random() * 0xffffffff) >>> 0);
  const match = useMemo(
    () =>
      new LocalMatch(loadContent(), {
        seed: (seed + round * 7919) >>> 0,
        mode: 'mode.classic',
        players,
        map: MAP_SIZES[size],
      }),
    [seed, round, players, size],
  );
  return (
    <MatchView
      key={round}
      match={match}
      settings={settings}
      controls={() => true}
      onExit={onExit}
      onRematch={() => setRound((r) => r + 1)}
    />
  );
}

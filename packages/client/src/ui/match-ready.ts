import { useSyncExternalStore } from 'react';
import type { GameMatch } from '../game/match';

/** True once a match has its first map (a match in the sim worker builds its world over there). */
export function useMatchReady(match: GameMatch | null): boolean {
  return useSyncExternalStore(
    (changed) => match?.whenReady(changed) ?? (() => {}),
    () => match?.ready ?? false,
  );
}

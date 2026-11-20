import type { HudState } from '../game/match';

/**
 * How tense the match is for the music (§7.2): 0 calm (the battle tune alone), 1 a fight is on (a
 * tank badly hurt, or the last two left of a bigger match), 2 the end is close (a tank near death,
 * or sudden death). The shop and the match-over screen are calm.
 */
export type Tension = 0 | 1 | 2;

/** Health share below which a tank counts as hurt (level 1) and near death (level 2). */
export const HURT = 0.6;
export const NEAR_DEATH = 0.3;

export function musicTension(h: Pick<HudState, 'phase' | 'suddenDeath' | 'tanks'>): Tension {
  if (h.phase === 'shop' || h.phase === 'over') return 0;
  if (h.suddenDeath) return 2;
  let alive = 0;
  let low = 1;
  for (const t of h.tanks) {
    if (!t.alive) continue;
    alive++;
    low = Math.min(low, t.health / Math.max(1, t.maxHealth));
  }
  if (alive >= 2 && low < NEAR_DEATH) return 2;
  if (low < HURT || (alive === 2 && h.tanks.length > 2)) return 1;
  return 0;
}

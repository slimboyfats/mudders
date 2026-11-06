import { describe, expect, it } from 'vitest';
import { PRESETS, activeTeams, canStart, estimateMinutes, toWorldOptions } from './setup';

describe('match setup', () => {
  it('estimates a standard 4-player match inside the playtested 5–10 minutes', () => {
    const m = estimateMinutes(PRESETS.standard.rounds, PRESETS.standard.turnTimer, 4);
    expect(m).toBeGreaterThanOrEqual(5);
    expect(m).toBeLessThanOrEqual(10);
  });

  it('orders the presets by length, marathon the longest', () => {
    const len = (k: keyof typeof PRESETS) =>
      estimateMinutes(PRESETS[k].rounds, PRESETS[k].turnTimer, 4);
    expect(len('quick')).toBeLessThan(len('standard'));
    expect(len('standard')).toBeLessThan(len('long'));
    expect(len('long')).toBeLessThan(len('marathon'));
    expect(estimateMinutes(3, 15, 8)).toBeGreaterThan(estimateMinutes(3, 15, 4));
  });

  it('needs two teams to start a team game and picks mode.teams', () => {
    const base = {
      slots: ['human', 'ai.shooter', 'off', 'ai.tosser'],
      size: 'small' as const,
      scenery: 'none' as const,
      rounds: 1,
      turnTimer: 0,
      wind: 'none' as const,
      suddenDeath: false,
      startingCash: 0,
    };
    expect(canStart({ ...base, teams: null })).toBe(true);
    expect(canStart({ ...base, teams: [0, 0, 1, 0] })).toBe(false);
    expect(activeTeams({ ...base, teams: [0, 1, 1, 0] })).toEqual([0, 1, 0]);
    const o = toWorldOptions({ ...base, teams: [0, 1, 1, 0] }, 1);
    expect(o.mode).toBe('mode.teams');
    expect(o.teams).toEqual([0, 1, 0]);
    expect(toWorldOptions({ ...base, teams: null }, 1).mode).toBe('mode.classic');
  });
});

import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  activeTeams,
  canStart,
  defaultSetup,
  estimateMinutes,
  roundTwists,
  shuffledMaps,
  toWorldOptions,
  weatherFor,
} from './setup';

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
      tanks: ['tank.scout', 'auto', 'tank.bruiser', 'random'],
    };
    expect(canStart({ ...base, teams: null })).toBe(true);
    expect(canStart({ ...base, teams: [0, 0, 1, 0] })).toBe(false);
    expect(activeTeams({ ...base, teams: [0, 1, 1, 0] })).toEqual([0, 1, 0]);
    const o = toWorldOptions({ ...base, teams: [0, 1, 1, 0] }, 1);
    expect(o.mode).toBe('mode.teams');
    expect(o.teams).toEqual([0, 1, 0]);
    // off seats drop out of the tank list too
    expect(o.tanks).toEqual(['tank.scout', 'auto', 'random']);
    expect(toWorldOptions({ ...base, teams: null }, 1).mode).toBe('mode.classic');
  });

  it("passes the player's sudden-death start turn to the match rules", () => {
    const base = {
      slots: ['human', 'ai.shooter'],
      size: 'small' as const,
      scenery: 'none' as const,
      rounds: 1,
      turnTimer: 0,
      wind: 'none' as const,
      startingCash: 0,
      teams: null,
      tanks: ['auto', 'auto'],
    };
    const on = toWorldOptions({ ...base, suddenDeath: true, suddenDeathFrom: 3 }, 1);
    expect(on.rules).toMatchObject({ suddenDeath: true, suddenDeathFrom: 3 });
    // off wins over a remembered start turn; unset leaves the mode's default
    const off = toWorldOptions({ ...base, suddenDeath: false, suddenDeathFrom: 3 }, 1);
    expect(off.rules?.suddenDeathFrom).toBeUndefined();
    expect(
      toWorldOptions({ ...base, suddenDeath: true }, 1).rules?.suddenDeathFrom,
    ).toBeUndefined();
  });

  it('passes start money and the per-round bonus to the match rules', () => {
    const base = {
      slots: ['human', 'ai.shooter'],
      size: 'small' as const,
      scenery: 'none' as const,
      rounds: 3,
      turnTimer: 0,
      wind: 'none' as const,
      suddenDeath: false,
      teams: null,
      tanks: ['auto', 'auto'],
    };
    const on = toWorldOptions({ ...base, startingCash: 100_000, roundBonus: 20_000 }, 1);
    expect(on.rules).toMatchObject({ startingCash: 100_000, roundBonus: 20_000 });
    // off leaves the rule out, so the sim pays nothing extra
    expect(
      toWorldOptions({ ...base, startingCash: 0, roundBonus: 0 }, 1).rules?.roundBonus,
    ).toBeUndefined();
    expect(toWorldOptions({ ...base, startingCash: 0 }, 1).rules?.roundBonus).toBeUndefined();
  });
});

describe('weather pick', () => {
  it('maps to a weather id, random agreeing across peers by seed', () => {
    expect(weatherFor('clear', 5)).toBeUndefined();
    expect(weatherFor('rain', 5)).toBe('weather.rain');
    expect(weatherFor('snow', 5)).toBe('weather.snow');
    const picks = new Set([0, 1, 2, 3, 4, 5].map((s) => weatherFor('random', s) ?? 'clear'));
    expect(picks).toEqual(new Set(['clear', 'weather.rain', 'weather.snow']));
    expect(weatherFor('random', 1234)).toBe(weatherFor('random', 1234));
  });
});

describe('map shuffle', () => {
  it('plays every map once before any comes back, never the same twice running', () => {
    const maps = shuffledMaps(20, 77);
    expect(maps).toHaveLength(20);
    expect(new Set(maps.slice(0, 10)).size).toBe(10);
    expect(new Set(maps.slice(10)).size).toBe(10);
    for (let i = 1; i < maps.length; i++) expect(maps[i]).not.toBe(maps[i - 1]);
    expect(shuffledMaps(20, 77)).toEqual(maps);
    expect(shuffledMaps(20, 78)).not.toEqual(maps);
  });

  it('gives the sim a map per round, starting on the first', () => {
    const s = { ...defaultSetup(), scenery: 'shuffle' as const, rounds: 3 };
    const o = toWorldOptions(s, 9);
    const maps = shuffledMaps(3, 9);
    expect(o.map?.generator).toBe(maps[0]);
    expect(o.perRound?.map((r) => r.generator)).toEqual(maps);
  });

  it('rolls random weather again each round, round 1 as before', () => {
    const s = { ...defaultSetup(), weather: 'random' as const, rounds: 8 };
    const o = toWorldOptions(s, 9);
    expect(o.weather).toBe(weatherFor('random', 9));
    expect(o.perRound?.[0]?.weather ?? undefined).toBe(o.weather);
    expect(o.perRound?.[0]?.generator).toBeUndefined();
    expect(new Set(o.perRound?.map((r) => r.weather)).size).toBeGreaterThan(1);
  });

  it('keeps a fixed map and sky with no per-round plan', () => {
    expect(toWorldOptions(defaultSetup(), 9).perRound).toBeUndefined();
  });
});

describe('round twists', () => {
  it('gives about every other round a twist, never the same twice running', () => {
    const t = roundTwists(200, 3);
    const n = t.filter(Boolean).length;
    expect(n).toBeGreaterThan(70);
    expect(n).toBeLessThan(130);
    for (let i = 1; i < t.length; i++) if (t[i]) expect(t[i]).not.toBe(t[i - 1]);
    expect(roundTwists(200, 3)).toEqual(t);
  });

  it('passes each round its twist, and none when off', () => {
    const on = toWorldOptions({ ...defaultSetup(), twists: true, rounds: 10 }, 4);
    const want = roundTwists(10, 4).map((x) => x?.name);
    expect(on.perRound?.map((r) => r.twist)).toEqual(want);
    expect(toWorldOptions({ ...defaultSetup(), rounds: 10 }, 4).perRound).toBeUndefined();
  });
});

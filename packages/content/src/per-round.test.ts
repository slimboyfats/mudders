import { describe, expect, it } from 'vitest';
import type { World, WorldOptions } from '@mudders/sim';
import { makeWorld } from './testing';

/** A two-bot match whose rounds end fast (every tank on 1 health). */
const shuffled = () =>
  makeWorld({
    seed: 11,
    players: 2,
    bots: ['ai.shooter', 'ai.shooter'],
    map: { generator: 'gen.hills', width: 600, height: 300 },
    rules: { rounds: 3, turnTimer: 0, suddenDeath: false, mapEvents: true },
    perRound: [
      { generator: 'gen.caves', weather: null },
      { generator: 'gen.glacier', weather: 'weather.snow' },
    ],
  });

/** Step until round `r` is being played. */
function playUntilRound(w: World, r: number): void {
  for (let i = 0; i < 60_000 && !(w.round === r && w.phase !== 'shop'); i++) {
    if (w.phase !== 'shop') for (const t of w.tanks) t.health = Math.min(t.health, 1);
    w.step();
  }
}

describe('per-round map and weather (map shuffle)', () => {
  it('plays each round on its own map under its own sky', () => {
    const w = shuffled();
    expect(w.generator).toBe('gen.caves');
    expect(w.weather).toBeNull();
    expect(w.drag).toBe(0);
    playUntilRound(w, 1);
    expect(w.round).toBe(1);
    expect(w.generator).toBe('gen.glacier');
    expect(w.weather?.id).toBe('weather.snow');
    expect(w.snapshot().weather?.id).toBe('weather.snow');
    playUntilRound(w, 2);
    // the list wraps: round 3 is the first entry again
    expect(w.generator).toBe('gen.caves');
    expect(w.weather).toBeNull();
  });

  it('leaves a match without the option on one map', () => {
    const w = makeWorld({ seed: 11, players: 2, map: { generator: 'gen.hills' } });
    expect(w.generator).toBe('gen.hills');
  });

  it('is deterministic', () => {
    const a = shuffled();
    const b = shuffled();
    playUntilRound(a, 1);
    playUntilRound(b, 1);
    expect(a.hash()).toBe(b.hash());
  });
});

describe('round twists', () => {
  const twisted = (plan: Partial<WorldOptions>) =>
    makeWorld({
      seed: 5,
      players: 2,
      map: { generator: 'gen.hills', width: 600, height: 300 },
      rules: { turnTimer: 0, suddenDeath: false, windType: 'perTurn' },
      ...plan,
    });

  it('Low gravity halves gravity for the round', () => {
    const base = twisted({}).gravity;
    expect(twisted({ perRound: [{ gravity: 50 }] }).gravity).toBe(Math.trunc(base / 2));
  });

  it('Gale scales the wind', () => {
    const calm = twisted({});
    const gale = twisted({ perRound: [{ wind: 250 }] });
    expect(calm.windBase).not.toBe(0);
    expect(gale.windBase).toBe(Math.trunc((calm.windBase * 250) / 100));
  });

  it('Double damage hurts twice as much', () => {
    const hit = (pct: number) => {
      const w = twisted({ perRound: [{ damage: pct }] });
      const t = w.tanks[0]!;
      const before = t.health;
      t.shield = 0;
      (w as unknown as { damageTank(t: unknown, d: number, by: number): void }).damageTank(
        t,
        10,
        1,
      );
      return before - t.health;
    };
    expect(hit(200)).toBe(2 * hit(100));
  });
});

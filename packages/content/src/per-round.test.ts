import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
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

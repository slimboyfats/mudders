import { describe, expect, it } from 'vitest';
import { effectsOf, makeWorld, passTurns } from '../../../src/testing';

const fronts = (events: string[]) =>
  makeWorld({
    seed: 3,
    players: 2,
    map: { generator: 'gen.hills', width: 600, height: 300 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents: true },
    perRound: [{ twist: 'Weather fronts', weather: null, events }],
  });

describe('terrainop.weather-fronts', { timeout: 60_000 }, () => {
  it('changes the weather every few turns during the round', () => {
    const w = fronts(['terrainop.weather-fronts']);
    expect(w.sky).toBeNull();
    const seen = new Set<string>();
    let changes = 0;
    let last: string | null = null;
    for (let k = 0; k < 9; k++) {
      passTurns(w, 1);
      const sky = w.sky ?? 'clear';
      seen.add(sky);
      if (sky !== last) changes++;
      last = sky;
    }
    expect(effectsOf(w, 'weatherFront').length).toBeGreaterThanOrEqual(3);
    expect(changes).toBeGreaterThanOrEqual(3);
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('brings the weather’s rules with it: rain drags on shells', () => {
    const w = fronts(['terrainop.weather-fronts']);
    for (let k = 0; k < 12 && w.sky !== 'weather.rain'; k++) passTurns(w, 1);
    expect(w.sky).toBe('weather.rain');
    expect(w.drag).toBeGreaterThan(0);
  });

  it('stays off in a round without the twist', () => {
    const w = fronts([]);
    passTurns(w, 6);
    expect(w.sky).toBeNull();
    expect(effectsOf(w, 'weatherFront')).toHaveLength(0);
  });

  it('is deterministic', () => {
    const a = fronts(['terrainop.weather-fronts']);
    const b = fronts(['terrainop.weather-fronts']);
    passTurns(a, 6);
    passTurns(b, 6);
    expect(a.hash()).toBe(b.hash());
  });
});

import { describe, expect, it } from 'vitest';
import { MAP_SIZES, MAX_PLAYERS } from '@mudders/shared';
import { makeWorld } from './testing';

describe('8 players (milestone 7)', () => {
  it('caps at 8', () => {
    expect(MAX_PLAYERS).toBe(8);
  });

  for (const generator of ['gen.hills', 'gen.village', 'gen.badlands']) {
    it(`${generator} spaces 8 tanks apart on the small map`, () => {
      for (let seed = 1; seed <= 4; seed++) {
        const w = makeWorld({ seed, players: 8, map: { ...MAP_SIZES.small, generator } });
        expect(w.tanks).toHaveLength(8);
        const xs = w.tanks.map((t) => t.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(40);
        for (const t of w.tanks) expect(t.alive).toBe(true);
      }
    });
  }

  it('plays an 8-bot match to the end', () => {
    const w = makeWorld({
      seed: 5,
      players: 8,
      map: { ...MAP_SIZES.medium, generator: 'gen.hills' },
      bots: Array.from({ length: 8 }, (_, i) => (i % 2 ? 'ai.shooter' : 'ai.tosser')),
      rules: { rounds: 1, turnTimer: 0 },
    });
    for (let i = 0; i < 400_000 && w.phase !== 'over'; i++) w.step();
    expect(w.phase).toBe('over');
    expect(w.results).toHaveLength(1);
    expect(w.results[0]!.points).toHaveLength(8);
  });
});

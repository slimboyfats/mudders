import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('ai.poolshark', () => {
  it('solves through the wind and lands its first shell next to the target', () => {
    for (const wind of [-0.008, 0, 0.008]) {
      const w = makeWorld({
        seed: 3,
        map: { width: 800, height: 400 },
        tankColumns: [150, 620],
        wind,
        turnOrder: [0, 1],
        bots: ['ai.poolshark', 'ai.poolshark'],
      });
      for (let i = 0; i < 400 && w.tanks[0]!.lastShotX < 0; i++) w.step();
      expect(Math.abs(w.tanks[0]!.lastShotX - 620)).toBeLessThan(30);
    }
  });

  it('plays a whole match against itself and shops between rounds', () => {
    const w = makeWorld({
      seed: 11,
      map: { width: 600, height: 300 },
      players: 3,
      bots: ['ai.poolshark', 'ai.poolshark', 'ai.poolshark'],
      rules: { rounds: 2 },
    });
    let shopped = false;
    for (let i = 0; i < 60_000 && w.phase !== 'over'; i++) {
      w.step();
      if (w.phase === 'shop') shopped = true;
    }
    expect(w.phase).toBe('over');
    expect(shopped).toBe(true);
    expect(w.results).toHaveLength(2);
    expect(w.matchWinner).toBeGreaterThanOrEqual(0);
  });
});

import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('ai.cyborg', () => {
  it('hits the weakest tank with its first shell, through the wind', () => {
    for (const wind of [-0.008, 0.008]) {
      const w = makeWorld({
        seed: 3,
        map: { width: 800, height: 400 },
        players: 3,
        tankColumns: [150, 400, 650],
        wind,
        turnOrder: [0, 1, 2],
        bots: ['ai.cyborg', 'ai.cyborg', 'ai.cyborg'],
        tankSetup: [undefined, undefined, { health: 40 }],
      });
      for (let i = 0; i < 600 && w.tanks[0]!.lastShotX < 0; i++) w.step();
      expect(Math.abs(w.tanks[0]!.lastShotX - 650)).toBeLessThan(12);
      expect(w.tanks[2]!.health).toBeLessThan(40);
      expect(w.tanks[1]!.health).toBe(100);
    }
  });

  it('beats a Moron over a match', () => {
    const w = makeWorld({
      seed: 9,
      map: { width: 600, height: 300 },
      players: 2,
      bots: ['ai.cyborg', 'ai.moron'],
      rules: { rounds: 2 },
    });
    for (let i = 0; i < 60_000 && w.phase !== 'over'; i++) w.step();
    expect(w.phase).toBe('over');
    expect(w.matchWinner).toBe(0);
  });
});

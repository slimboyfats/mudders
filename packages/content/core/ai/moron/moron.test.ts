import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('ai.moron', () => {
  it('fires a shot every turn without any input and the round finishes', () => {
    const w = makeWorld({
      seed: 2,
      map: { width: 600, height: 300 },
      bots: ['ai.moron', 'ai.moron'],
      rules: { rounds: 1, turnCap: 3 },
    });
    let shots = 0;
    for (let i = 0; i < 20_000 && w.phase !== 'over'; i++) {
      const before = w.phase;
      w.step();
      if (before === 'aim' && w.phase === 'resolve') shots++;
    }
    expect(w.phase).toBe('over');
    expect(shots).toBeGreaterThanOrEqual(2);
    expect(shots).toBeLessThanOrEqual(6);
  });

  it('spends money at random in the shop', () => {
    const w = makeWorld({
      seed: 2,
      bots: ['ai.moron', 'ai.moron'],
      rules: { startingCash: 50_000 },
    });
    for (const t of w.tanks) t.money = 50_000;
    // end the round by killing player 1
    w.tanks[1]!.health = 0;
    w.tanks[1]!.alive = false;
    for (let i = 0; i < 6000 && w.round === 0; i++) w.step();
    expect(w.round).toBe(1);
    expect(w.tanks.some((t) => t.money < 50_000 + w.results[0]!.earned[t.player]!)).toBe(true);
  });
});

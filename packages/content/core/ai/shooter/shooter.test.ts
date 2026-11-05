import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('ai.shooter', () => {
  it('brackets toward the target: later shells land closer than the first', () => {
    const w = makeWorld({
      seed: 5,
      map: { width: 800, height: 400 },
      tankColumns: [150, 620],
      wind: 0.006,
      turnOrder: [0, 1],
      bots: ['ai.shooter', 'ai.moron'],
    });
    for (const t of w.tanks) t.health = 100_000;
    const misses: number[] = [];
    let seen = -1;
    for (let i = 0; i < 20_000 && misses.length < 5; i++) {
      w.step();
      const t = w.tanks[0]!;
      if (w.phase === 'aim' && w.activePlayer === 1 && t.lastShotX >= 0 && seen !== w.turn) {
        seen = w.turn;
        misses.push(Math.abs(t.lastShotX - w.tanks[1]!.x));
      }
    }
    expect(misses).toHaveLength(5);
    expect(Math.min(...misses.slice(1))).toBeLessThan(misses[0]!);
    expect(Math.min(...misses)).toBeLessThan(40);
  });
});

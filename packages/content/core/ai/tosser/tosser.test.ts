import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('ai.tosser', () => {
  it('lobs a steep shell that lands next to the nearest tank', () => {
    const w = makeWorld({
      seed: 3,
      map: { width: 800, height: 400 },
      tankColumns: [150, 620],
      wind: 0.004,
      turnOrder: [0, 1],
      bots: ['ai.tosser', 'ai.tosser'],
    });
    for (let i = 0; i < 600 && w.tanks[0]!.lastShotX < 0; i++) w.step();
    expect(w.tanks[0]!.lastShotAngle).toBeGreaterThanOrEqual(56);
    expect(Math.abs(w.tanks[0]!.lastShotX - 620)).toBeLessThan(30);
  });

  it('plays a whole match and shops for heavy weapons', () => {
    const w = makeWorld({
      seed: 5,
      map: { width: 600, height: 300 },
      players: 2,
      bots: ['ai.tosser', 'ai.moron'],
      rules: { rounds: 2 },
    });
    for (let i = 0; i < 60_000 && w.phase !== 'over'; i++) w.step();
    expect(w.phase).toBe('over');
  });
});

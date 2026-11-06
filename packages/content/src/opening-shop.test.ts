import { describe, expect, it } from 'vitest';
import { makeWorld } from './testing';

describe('opening shop (§3.6)', () => {
  it('bots shop before round 1 and a human-less match starts at once', () => {
    const w = makeWorld({
      seed: 9,
      players: 2,
      bots: ['ai.cyborg', 'ai.poolshark'],
      rules: { openingShop: true, startingCash: 20_000 },
    });
    // every bot shopped in the constructor, so the shop closes on the first tick
    expect(w.phase).toBe('shop');
    expect(w.tanks.every((t) => t.ready && t.money < 20_000)).toBe(true);
    w.step();
    expect(w.phase).toBe('aim');
    expect(w.results).toHaveLength(0);
  });

  it('waits for the human, with bots already done', () => {
    const w = makeWorld({
      seed: 9,
      players: 2,
      bots: [null, 'ai.cyborg'],
      rules: { openingShop: true },
    });
    w.run(100);
    expect(w.phase).toBe('shop');
    expect(w.tanks[1]!.ready).toBe(true);
    w.applyInput(0, { type: 'ready' });
    w.step();
    expect(w.phase).toBe('aim');
  });
});

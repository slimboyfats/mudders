import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { LocalMatch, STEP_MS } from './match';

const match = () =>
  new LocalMatch(loadContent(), {
    seed: 7,
    mode: 'mode.classic',
    players: 2,
    map: { generator: 'gen.hills', width: 320, height: 200 },
  });

describe('frame budget', () => {
  it('runs every tick it owes when there is no limit', () => {
    const m = match();
    m.advance(STEP_MS * 4 + 1);
    expect(m.world.tick).toBe(4);
    expect(m.shed).toBe(0);
  });

  it('draws after one tick when the sim is over budget, and drops the ticks it owed', () => {
    const m = match();
    m.limitFrame(-1); // every tick is too slow
    m.advance(STEP_MS * 4 + 1);
    expect(m.world.tick).toBe(1);
    expect(m.shed).toBe(1);
    m.advance(STEP_MS);
    expect(m.world.tick).toBe(2); // no burst afterwards
    expect(m.shed).toBe(1);
  });
});

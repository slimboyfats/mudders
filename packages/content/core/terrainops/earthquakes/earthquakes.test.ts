import { describe, expect, it } from 'vitest';
import { effectsOf, makeWorld, passTurns } from '../../../src/testing';

const quakes = (events: string[]) =>
  makeWorld({
    seed: 5,
    players: 2,
    map: { generator: 'gen.village', width: 800, height: 400 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents: true },
    perRound: [{ twist: 'Earthquakes', events }],
  });

/** Sum over columns of how far the ground differs from its neighbour: falls as slopes level. */
function rough(w: ReturnType<typeof quakes>): number {
  let r = 0;
  for (let x = 1; x < w.grid.width; x++) r += Math.abs(w.grid.surfaceY(x) - w.grid.surfaceY(x - 1));
  return r;
}

const settle = (w: ReturnType<typeof quakes>) => {
  for (let i = 0; i < 400; i++) w.step();
};

describe('terrainop.earthquakes', () => {
  it('shakes the ground from the second turn on and levels steep slopes', () => {
    const w = quakes(['terrainop.earthquakes']);
    const calm = quakes([]);
    passTurns(w, 1);
    passTurns(calm, 1);
    expect(effectsOf(w, 'earthquake')).toHaveLength(0);
    passTurns(w, 2);
    passTurns(calm, 2);
    settle(w);
    settle(calm);
    expect(effectsOf(w, 'earthquake').length).toBeGreaterThan(0);
    expect(rough(w)).toBeLessThan(rough(calm));
  });

  it('stays off in a round without the twist', () => {
    const w = quakes([]);
    passTurns(w, 3);
    expect(effectsOf(w, 'earthquake')).toHaveLength(0);
  });

  it('is deterministic', () => {
    const a = quakes(['terrainop.earthquakes']);
    const b = quakes(['terrainop.earthquakes']);
    passTurns(a, 3);
    passTurns(b, 3);
    expect(a.hash()).toBe(b.hash());
  });
});

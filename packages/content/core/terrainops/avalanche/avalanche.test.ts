import { describe, expect, it } from 'vitest';
import { effectsOf, makeWorld, passTurns } from '../../../src/testing';

const glacier = (mapEvents: boolean, seed = 2) =>
  makeWorld({
    seed,
    players: 2,
    map: { generator: 'gen.glacier', width: 1000, height: 500 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents },
  });

describe('terrainop.avalanche', () => {
  it('lets a slab go down a steep Glacier slope every few turns', () => {
    let slides = 0;
    for (const seed of [1, 2, 3]) {
      const w = glacier(true, seed);
      passTurns(w, 8);
      slides += effectsOf(w, 'avalanche').length;
    }
    expect(slides).toBeGreaterThanOrEqual(3);
  });

  it('never slides without the rule', () => {
    const w = glacier(false);
    passTurns(w, 8);
    expect(effectsOf(w, 'avalanche')).toHaveLength(0);
  });

  it('is deterministic', () => {
    const a = glacier(true);
    const b = glacier(true);
    passTurns(a, 5);
    passTurns(b, 5);
    expect(a.hash()).toBe(b.hash());
  });
});

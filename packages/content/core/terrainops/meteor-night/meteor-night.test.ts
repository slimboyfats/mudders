import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, makeWorld, passTurns } from '../../../src/testing';

const night = (events: string[]) =>
  makeWorld({
    seed: 4,
    players: 2,
    map: { generator: 'gen.hills', width: 800, height: 400 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents: true },
    perRound: [{ twist: 'Meteor night', events }],
  });

describe('terrainop.meteor-night', () => {
  it('rains meteors from the second turn on, and they dig real craters', () => {
    const w = night(['terrainop.meteor-night']);
    const before = countCells(w);
    expect(effectsOf(w, 'meteorNight')).toHaveLength(0);
    passTurns(w, 3);
    const calls = effectsOf(w, 'meteorNight');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 200; i++) w.step();
    expect(countCells(w)).toBeLessThan(before);
  });

  it('stays off in a round without the twist', () => {
    const w = night([]);
    passTurns(w, 3);
    expect(effectsOf(w, 'meteorNight')).toHaveLength(0);
  });

  it('is deterministic', () => {
    const a = night(['terrainop.meteor-night']);
    const b = night(['terrainop.meteor-night']);
    passTurns(a, 4);
    passTurns(b, 4);
    expect(a.hash()).toBe(b.hash());
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, makeWorld, passTurns } from '../../../src/testing';

const storm = (events: string[]) =>
  makeWorld({
    seed: 4,
    players: 2,
    map: { generator: 'gen.hills', width: 800, height: 400 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents: true },
    perRound: [{ twist: 'Lightning storm', weather: 'weather.rain', events }],
  });

describe('terrainop.lightning-storm', () => {
  it('strikes the highest tank and the tallest ground every turn from the second', () => {
    const w = storm(['terrainop.lightning-storm']);
    const before = countCells(w);
    passTurns(w, 1);
    expect(effectsOf(w, 'bolt')).toHaveLength(0);
    const high = w.tanks.reduce((a, t) => (t.y - t.h < a.y - a.h ? t : a));
    const hp = high.health;
    passTurns(w, 1);
    const bolts = effectsOf(w, 'bolt');
    expect(bolts.length).toBeGreaterThanOrEqual(2);
    expect(bolts.some((b) => b.x === high.x)).toBe(true);
    for (let i = 0; i < 200; i++) w.step();
    expect(high.health).toBeLessThan(hp);
    expect(countCells(w)).toBeLessThan(before);
  });

  it('stays off in a round without the twist', () => {
    const w = storm([]);
    passTurns(w, 3);
    expect(effectsOf(w, 'bolt')).toHaveLength(0);
  });

  it('is deterministic', () => {
    const a = storm(['terrainop.lightning-storm']);
    const b = storm(['terrainop.lightning-storm']);
    passTurns(a, 4);
    passTurns(b, 4);
    expect(a.hash()).toBe(b.hash());
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, makeWorld, passTurns } from '../../../src/testing';

const flood = (events: string[]) =>
  makeWorld({
    seed: 4,
    players: 2,
    map: { generator: 'gen.hills', width: 800, height: 400 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents: true },
    perRound: [{ twist: 'Rising water', events }],
  });

describe('terrainop.rising-water', () => {
  it('floods the low ground a few rows higher every turn', () => {
    const w = flood(['terrainop.rising-water']);
    expect(countCells(w, 'material.water')).toBe(0);
    passTurns(w, 2);
    const a = countCells(w, 'material.water');
    expect(a).toBeGreaterThan(0);
    passTurns(w, 3);
    expect(countCells(w, 'material.water')).toBeGreaterThan(a);
    const levels = effectsOf(w, 'floodRise').map((e) => e.y);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThan(levels[i - 1]!);
  });

  it('hurts a tank caught under the surface', () => {
    const w = flood(['terrainop.rising-water']);
    const t = w.tanks[0]!;
    // sink the flood start onto this tank: it sits in the lowest valley once the water is above it
    passTurns(w, 1);
    const hp = t.health;
    t.y = w.grid.height - 2;
    passTurns(w, 1);
    expect(t.health).toBeLessThan(hp);
  });

  it('stays off in a round without the twist', () => {
    const w = flood([]);
    passTurns(w, 4);
    expect(countCells(w, 'material.water')).toBe(0);
  });
});

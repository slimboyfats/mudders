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
    passTurns(w, 1);
    const hp = t.health;
    // drown it: water right over its top when the next turn starts
    const y = t.y - t.h - 1;
    w.grid.material[y * w.grid.width + t.x] = w.mats.cellOf('material.water');
    passTurns(w, 1);
    expect(t.health).toBeLessThan(hp);
  });

  it('pumps the water in over a few seconds instead of in one step', () => {
    const w = flood(['terrainop.rising-water']);
    passTurns(w, 1);
    const at = countCells(w, 'material.water');
    for (let i = 0; i < 30; i++) w.step();
    const soon = countCells(w, 'material.water');
    for (let i = 0; i < 300; i++) w.step();
    const later = countCells(w, 'material.water');
    expect(soon).toBeGreaterThan(at);
    expect(later).toBeGreaterThan(soon + 200);
  });

  it('stays off in a round without the twist', () => {
    const w = flood([]);
    passTurns(w, 4);
    expect(countCells(w, 'material.water')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, makeWorld, passTurns } from '../../../src/testing';

const world = (events: string[]) =>
  makeWorld({
    seed: 7,
    players: 2,
    map: { generator: 'gen.hills', width: 800, height: 400 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents: true },
    perRound: [{ twist: 'Twist', events }],
  });

const settle = (w: ReturnType<typeof world>) => {
  for (let i = 0; i < 400; i++) w.step();
};

describe('terrainop.quake-sinkholes', () => {
  it('only breaks the ground and takes it away, never adds any', () => {
    const w = world(['terrainop.earthquakes', 'terrainop.quake-sinkholes']);
    const calm = world([]);
    passTurns(w, 5);
    passTurns(calm, 5);
    settle(w);
    settle(calm);
    expect(countCells(w, 'material.dirt')).toBeLessThan(countCells(calm, 'material.dirt'));
  });

  it('is deterministic', () => {
    const a = world(['terrainop.earthquakes', 'terrainop.quake-sinkholes']);
    const b = world(['terrainop.earthquakes', 'terrainop.quake-sinkholes']);
    passTurns(a, 3);
    passTurns(b, 3);
    expect(a.hash()).toBe(b.hash());
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, makeWorld, passTurns } from '../../../src/testing';

const lakeland = (mapEvents: boolean) =>
  makeWorld({
    seed: 5,
    players: 2,
    map: { generator: 'gen.lakeland', width: 800, height: 400 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents },
  });

const water = (w: ReturnType<typeof lakeland>) => countCells(w, 'material.water');

/** Let the turn's tide finish its work. */
const tide = (w: ReturnType<typeof lakeland>) => {
  passTurns(w, 1);
  for (let i = 0; i < 800; i++) w.step();
};

describe('terrainop.tides', { timeout: 120_000 }, () => {
  it('floods the lakes up to high tide, then ebbs them below their old shores', () => {
    const w = lakeland(true);
    const start = water(w);
    expect(start).toBeGreaterThan(500);
    tide(w);
    expect(effectsOf(w, 'tide').length).toBeGreaterThan(0);
    tide(w);
    // turns 1 and 2 of 8: the tide comes in
    const high = water(w);
    expect(high).toBeGreaterThan(start + 200);
    for (let k = 0; k < 4; k++) tide(w);
    // turns 5 and 6: the tide is out
    expect(water(w)).toBeLessThan(start - 100);
  });

  it('only on with map events', () => {
    const w = lakeland(false);
    passTurns(w, 3);
    expect(effectsOf(w, 'tide')).toHaveLength(0);
  });

  it('is deterministic', () => {
    const a = lakeland(true);
    const b = lakeland(true);
    passTurns(a, 3);
    passTurns(b, 3);
    expect(a.hash()).toBe(b.hash());
  });
});

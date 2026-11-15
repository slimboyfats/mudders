import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, makeWorld, passTurns } from '../../../src/testing';

const rain = (events: string[]) =>
  makeWorld({
    seed: 7,
    players: 2,
    map: { generator: 'gen.hills', width: 800, height: 400 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents: true },
    perRound: [{ twist: 'Cloudburst', weather: 'weather.rain', events }],
  });

const water = (w: ReturnType<typeof rain>) => countCells(w, 'material.water');

// real water on a full-size map: slow under a loaded test run
describe('terrainop.cloudburst', { timeout: 90_000 }, () => {
  it('pours real water from the second turn on, which soaks away again between storms', () => {
    const w = rain(['terrainop.cloudburst']);
    passTurns(w, 1);
    expect(effectsOf(w, 'cloudburst')).toHaveLength(0);
    const dry = water(w);
    passTurns(w, 1);
    for (let i = 0; i < 240; i++) w.step();
    const wet = water(w);
    expect(wet - dry).toBeGreaterThan(500);
    for (let i = 0; i < 400; i++) w.step();
    expect(water(w)).toBeLessThan(wet - 300);
  });

  it('shakes the slopes under the storm loose', () => {
    const w = rain(['terrainop.cloudburst']);
    passTurns(w, 1);
    let loose = 0;
    for (let i = 0; i < 240; i++) {
      w.step();
      const cs = w.grid.cellState;
      let n = 0;
      for (let j = 0; j < cs.length; j++) if (cs[j] !== 0) n++;
      loose = Math.max(loose, n);
    }
    expect(loose).toBeGreaterThan(5);
  });

  it('stays off in a round without the twist', () => {
    const w = rain([]);
    const wet = rain(['terrainop.cloudburst']);
    passTurns(w, 3);
    passTurns(wet, 3);
    expect(effectsOf(w, 'cloudburst')).toHaveLength(0);
    // plain rain wets the ground a little; the cloudburst pours far more
    expect(water(wet)).toBeGreaterThan(water(w) + 300);
  });

  it('is deterministic', () => {
    const a = rain(['terrainop.cloudburst']);
    const b = rain(['terrainop.cloudburst']);
    passTurns(a, 3);
    passTurns(b, 3);
    expect(a.hash()).toBe(b.hash());
  });
});

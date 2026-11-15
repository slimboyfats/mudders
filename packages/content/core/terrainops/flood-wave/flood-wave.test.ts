import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, makeWorld, passTurns } from '../../../src/testing';

const sea = (events: string[]) =>
  makeWorld({
    seed: 7,
    players: 2,
    map: { generator: 'gen.hills', width: 800, height: 400 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents: true },
    perRound: [{ twist: 'Flood wave', events }],
  });

const water = (w: ReturnType<typeof sea>) => countCells(w, 'material.water');

/** Rightmost (or leftmost) column with water on top, from the edge the wave came in at. */
function front(w: ReturnType<typeof sea>, dir: number): number {
  const W = w.grid.width;
  const cell = w.mats.cellOf('material.water');
  let far = -1;
  for (let x = 0; x < W; x++) {
    const y = w.grid.surfaceY(x);
    if (y < w.grid.height && w.grid.material[y * W + x] === cell) {
      const d = dir > 0 ? x : W - 1 - x;
      if (d > far) far = d;
    }
  }
  return far;
}

describe('terrainop.flood-wave', () => {
  it('rolls a wave of real water in from an edge, every other turn from the second', () => {
    const w = sea(['terrainop.flood-wave']);
    passTurns(w, 1);
    expect(effectsOf(w, 'floodWave')).toHaveLength(0);
    const dry = water(w);
    passTurns(w, 1);
    for (let i = 0; i < 200; i++) w.step();
    const waves = w.snapshot().effectEvents.filter((e) => e.type === 'floodWave');
    expect(waves).toHaveLength(1);
    expect(water(w) - dry).toBeGreaterThan(3000);
    // it ran well inland, not just pooled by the edge
    expect(front(w, waves[0]!.params.dir ?? 1)).toBeGreaterThan(120);
  });

  it('stays off in a round without the twist', () => {
    const w = sea([]);
    passTurns(w, 3);
    expect(effectsOf(w, 'floodWave')).toHaveLength(0);
  });

  it('is deterministic', () => {
    const a = sea(['terrainop.flood-wave']);
    const b = sea(['terrainop.flood-wave']);
    passTurns(a, 3);
    passTurns(b, 3);
    expect(a.hash()).toBe(b.hash());
  });
});

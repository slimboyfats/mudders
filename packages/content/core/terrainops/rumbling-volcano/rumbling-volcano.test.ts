import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, makeWorld, passTurns } from '../../../src/testing';

const badlands = (mapEvents: boolean) =>
  makeWorld({
    seed: 3,
    players: 2,
    map: { generator: 'gen.badlands', width: 1000, height: 500 },
    rules: { turnTimer: 0, suddenDeath: false, mapEvents },
  });

describe('terrainop.rumbling-volcano', () => {
  it('raises a lava-filled cone on Badlands, well clear of the tanks', () => {
    const w = badlands(true);
    expect(countCells(w, 'material.cinder')).toBeGreaterThan(500);
    expect(countCells(w, 'material.lava')).toBeGreaterThan(0);
    const vent = effectsOf(w, 'volcanoGrow')[0]!;
    for (const t of w.tanks) expect(Math.abs(t.x - vent.x)).toBeGreaterThanOrEqual(110);
  });

  it('stays off without the rule, so other matches keep their results', () => {
    const w = badlands(false);
    expect(countCells(w, 'material.cinder')).toBe(0);
  });

  it('rumbles a turn ahead, then erupts real lava, and does it again later', () => {
    const w = badlands(true);
    effectsOf(w, 'volcanoGrow');
    passTurns(w, 2);
    w.step(); // the op hears about the new turn on the next tick
    const warn = effectsOf(w, 'rumble');
    expect(warn.length).toBe(1);
    expect(effectsOf(w, 'volcanoErupt')).toHaveLength(0);
    passTurns(w, 1);
    w.step();
    expect(effectsOf(w, 'volcanoErupt')).toHaveLength(1);
    passTurns(w, 6);
    expect(effectsOf(w, 'volcanoErupt').length).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic', () => {
    const a = badlands(true);
    const b = badlands(true);
    passTurns(a, 4);
    passTurns(b, 4);
    expect(a.hash()).toBe(b.hash());
  });
});

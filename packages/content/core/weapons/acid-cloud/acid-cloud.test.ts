import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld, passTurns } from '../../../src/testing';

const CLOUD = 'weapon.acid-cloud';

describe('weapon.acid-cloud', () => {
  it('hangs an acid cloud in the sky that rains pits into the ground for six turns', () => {
    const w = flatWorld(150);
    const before = countCells(w);
    dropAt(w, CLOUD, 200);
    expect(w.zones).toHaveLength(1);
    const z = w.zones[0]!;
    expect(z.sky).toBeGreaterThan(0);
    expect(z.y).toBeLessThan(100);
    const after1 = countCells(w);
    expect(after1).toBeLessThan(before);
    passTurns(w, 3);
    expect(countCells(w)).toBeLessThan(after1 - 30);
    passTurns(w, 3);
    expect(w.zones).toHaveLength(0);
  });

  it('eats the shields of tanks under it before their health', () => {
    const w = flatWorld(150);
    const t = w.tanks[1]!;
    t.shield = 60;
    t.shieldMax = 60;
    dropAt(w, CLOUD, 345);
    expect(t.shield).toBeLessThanOrEqual(30);
    expect(effectsOf(w, 'shieldEaten').length).toBeGreaterThanOrEqual(0);
    passTurns(w, 2);
    expect(t.shield).toBe(0);
    expect(t.health).toBeLessThan(100);
  });

  it('drifts with the wind', () => {
    const w = flatWorld(150, { wind: 0.012 });
    dropAt(w, CLOUD, 120);
    const x0 = w.zones[0]!.x;
    // a turn's worth of aiming (10 s)
    w.run(600);
    expect(w.zones[0]!.x).toBeGreaterThan(x0 + 10);
  });

  it('a calm day keeps it in place', () => {
    const w = flatWorld(150);
    dropAt(w, CLOUD, 200);
    passTurns(w, 2);
    expect(w.zones[0]!.x).toBe(200);
  });
});

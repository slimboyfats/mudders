import { describe, expect, it } from 'vitest';
import { FP } from '@mudders/sim';
import { flatten, makeWorld } from '../../../src/testing';

function flight(wind: number) {
  const w = makeWorld({ wind, tankColumns: [100, 1100], turnOrder: [0, 1] });
  flatten(w, 500);
  w.applyInput(0, { type: 'aim', angle: 60, power: 600 });
  w.applyInput(0, { type: 'fire' });
  w.step();
  const pts: [number, number][] = [];
  while (w.projectiles.length) {
    const p = w.projectiles[0]!;
    pts.push([p.x / FP, p.y / FP]);
    w.step();
  }
  return pts;
}

describe('flight.ballistic', () => {
  it('flies a symmetric arc with no wind', () => {
    const pts = flight(0);
    const apex = pts.reduce((a, p, i) => (p[1] < pts[a]![1] ? i : a), 0);
    const up = apex;
    const down = pts.length - apex;
    expect(Math.abs(up - down)).toBeLessThanOrEqual(8);
    expect(pts.at(-1)![0]).toBeGreaterThan(pts[0]![0]);
  });

  it('drifts with the wind', () => {
    expect(flight(0.01).at(-1)![0]).toBeGreaterThan(flight(0).at(-1)![0] + 20);
    expect(flight(-0.01).at(-1)![0]).toBeLessThan(flight(0).at(-1)![0] - 20);
  });
});

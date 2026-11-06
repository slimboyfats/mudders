import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.fault-line', () => {
  it('drops a rift valley under the impact and heaves slabs up beside it', () => {
    const w = flatWorld(150, { tankColumns: [20, 780], map: { width: 800, height: 300 } });
    dropAt(w, 'weapon.fault-line', 400);
    const g = w.grid;
    expect(g.surfaceY(400)).toBeGreaterThan(155);
    let high = g.height;
    for (let x = 250; x < 550; x++) high = Math.min(high, g.surfaceY(x));
    expect(high).toBeLessThan(145);
  });

  it('carries a tank on a heaving slab up with the ground', () => {
    const w = flatWorld(150, { tankColumns: [20, 780], map: { width: 800, height: 300 } });
    dropAt(w, 'weapon.fault-line', 400);
    const g = w.grid;
    // find the highest raised column and put a tank there on a fresh map, then fire again
    let best = 400;
    for (let x = 300; x < 500; x++) if (g.surfaceY(x) < g.surfaceY(best)) best = x;
    const w2 = flatWorld(150, { tankColumns: [20, best], map: { width: 800, height: 300 } });
    dropAt(w2, 'weapon.fault-line', 400);
    expect(w2.tanks[1]!.y).toBeLessThan(150);
  });
});

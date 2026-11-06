import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { dropAt, flatWorld, passTurns, slopeWorld } from '../../../src/testing';

const puffXs = (w: World): number[] => {
  const pf = w.zones[0]!.puffs;
  const xs: number[] = [];
  for (let o = 0; o < pf.length; o += 4) xs.push(pf[o]! >> 16);
  return xs;
};
const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;

describe('weapon.toxic-gas', () => {
  it('bursts into a cloud that chokes tanks inside it each turn for four turns', () => {
    const w = flatWorld(150, { tankColumns: [40, 210] });
    dropAt(w, 'weapon.toxic-gas', 200);
    expect(w.zones).toHaveLength(1);
    expect(w.zones[0]!.puffs.length).toBe(28 * 4);
    const hp = w.tanks[1]!.health;
    expect(hp).toBeLessThan(100);
    passTurns(w, 3);
    expect(w.tanks[1]!.health).toBe(hp - 24);
    passTurns(w, 2);
    expect(w.zones).toHaveLength(0);
    expect(w.tanks[0]!.health).toBe(100);
  });

  it('spreads along the ground and stays out of the dirt', () => {
    const w = flatWorld(150);
    dropAt(w, 'weapon.toxic-gas', 200);
    w.run(240);
    const pf = w.zones[0]!.puffs;
    const xs = puffXs(w);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
    for (let o = 0; o < pf.length; o += 4) {
      const x = pf[o]! >> 16;
      const y = pf[o + 1]! >> 16;
      // hugging the ground: just above the surface (or down in the crater), never in it
      expect(w.grid.material[y * w.grid.width + x]).toBe(0);
      expect(y).toBeGreaterThan(150 - 20);
    }
  });

  it('runs downhill', () => {
    // ground falls away to the right, one row every 3 columns
    const w = slopeWorld(60, 3, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.toxic-gas', 150);
    const x0 = w.zones[0]!.x;
    w.run(600);
    expect(w.zones[0]!.x).toBeGreaterThan(x0 + 30);
  });

  it('drifts with the wind', () => {
    const calm = flatWorld(150, { wind: 0 });
    const windy = flatWorld(150, { wind: 0.012 });
    dropAt(calm, 'weapon.toxic-gas', 200);
    dropAt(windy, 'weapon.toxic-gas', 200);
    calm.run(600);
    windy.run(600);
    expect(mean(puffXs(windy))).toBeGreaterThan(mean(puffXs(calm)) + 20);
  });

  it('blows off the map, except what pools in its own crater', () => {
    const w = flatWorld(150, { wind: -0.012 });
    dropAt(w, 'weapon.toxic-gas', 30);
    w.run(3000);
    expect(w.zones.length === 0 || w.zones[0]!.puffs.length < 28 * 2).toBe(true);
  });
});

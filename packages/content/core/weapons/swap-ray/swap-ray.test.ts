import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.swap-ray', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.swap-ray')).toBe(true);
  });

  it('trades places with the tank it reaches, through a hill, unhurt', () => {
    const w = flatWorld(150, { tankColumns: [60, 320] });
    // a hill between them that the ray passes through untouched
    const g = w.grid;
    const dirt = w.mats.cellOf('material.dirt');
    for (let y = 100; y < 150; y++) for (let x = 180; x < 220; x++) g.material[y * g.width + x] = dirt;
    const before = g.material.slice();
    launchAt(w, 'weapon.swap-ray', 72, 146, 4, 0);
    expect(w.tanks[0]!.x).toBe(320);
    expect(w.tanks[1]!.x).toBe(60);
    expect(w.tanks[0]!.y).toBe(150);
    expect(w.tanks[1]!.y).toBe(150);
    expect(w.tanks[0]!.health).toBe(100);
    expect(w.tanks[1]!.health).toBe(100);
    expect(g.material).toEqual(before);
    expect(effectsOf(w, 'warpIn')).toHaveLength(2);
  });

  it('does nothing when it reaches no tank', () => {
    const w = flatWorld(150, { tankColumns: [60, 320] });
    launchAt(w, 'weapon.swap-ray', 72, 120, 3, -3);
    expect(w.tanks[0]!.x).toBe(60);
    expect(w.tanks[1]!.x).toBe(320);
  });
});

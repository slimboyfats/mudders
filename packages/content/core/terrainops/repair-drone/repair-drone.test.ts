import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { dropAt, effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('terrainop.repair-drone', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('terrainop.repair-drone')).toBe(true);
  });

  it('is knocked down by a shell going off near it', () => {
    const w = flatWorld();
    const t = w.tanks[0]!;
    t.health = 40;
    dropAt(w, 'weapon.repair-drone', 60);
    effectsOf(w, 'droneDown');
    // a baby missile slams into the ground 10 cells from the drone's hover spot
    launchAt(w, 'weapon.baby-missile', 50, t.y - 14, 0, 2);
    expect(effectsOf(w, 'droneDown').length).toBe(1);
  });

  it('lives on the map without holding up the turn once it hovers', () => {
    const w = flatWorld();
    w.tanks[0]!.health = 40;
    dropAt(w, 'weapon.repair-drone', 60);
    expect(w.phase).toBe('aim');
    for (let i = 0; i < 30; i++) w.step();
    expect(effectsOf(w, 'drone').length).toBeGreaterThan(20);
  });
});

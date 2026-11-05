import { describe, expect, it } from 'vitest';
import { countCells, fireAndSettle, makeWorld } from '../../../src/testing';

describe('weapon.shockwave', () => {
  it('reshapes terrain without destroying it and shoves the target', () => {
    const w = makeWorld({
      seed: 7,
      map: { width: 800, height: 400 },
      tankColumns: [150, 620],
      wind: 0,
      turnOrder: [0, 1],
    });
    const before = countCells(w);
    const hash = w.hash();
    fireAndSettle(w, 'weapon.shockwave', 55, 590);
    expect(w.hash()).not.toBe(hash);
    // mass conserved apart from debris thrown off the map edges
    expect(before - countCells(w)).toBeLessThan(before * 0.01);
    expect(w.tanks[1]!.x).toBeGreaterThan(620);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(w.tanks[0]!.inventory).toContain(2);
  });
});

import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.mud-geyser', () => {
  it('erupts a column of globs and soaks the ground around the vent into mud', () => {
    const w = flatWorld();
    expect(countCells(w, 'material.mud')).toBe(0);
    const n = dropAt(w, 'weapon.mud-geyser', 200, 3000);
    expect(n).toBeLessThan(3000);
    const fx = w.snapshot().effectEvents;
    const erupt = fx.filter((e) => e.type === 'eruption');
    expect(erupt).toHaveLength(1);
    // every glob came back down near the vent
    const splats = fx.filter((e) => e.type === 'mudSplat');
    expect(splats).toHaveLength(16);
    for (const s of splats) expect(Math.abs(s.x - erupt[0]!.x)).toBeLessThan(80);
    // the soaked ring plus the fallen globs: a wide patch of mud
    expect(countCells(w, 'material.mud')).toBeGreaterThan(1500);
  });
});

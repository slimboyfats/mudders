import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld, launchAt } from '../../../src/testing';

/** A flat dirt world with a crystal slab standing on the ground at columns [x0, x1). */
function slabWorld(x0: number, x1: number, top = 90) {
  const w = flatWorld();
  const c = w.mats.cellOf('material.crystal');
  for (let y = top; y < 150; y++) for (let x = x0; x < x1; x++) w.grid.set(x, y, c);
  w.grid.clearSettle();
  w.grid.clearReact();
  return w;
}

describe('material.crystal', () => {
  it('mirrors a laser: the beam bounces back without cutting the crystal', () => {
    const w = slabWorld(200, 230);
    const before = countCells(w, 'material.crystal');
    w.snapshot();
    // a level beam from the left at the slab
    launchAt(w, 'weapon.laser', 120, 120, 4, 0, 400);
    const hits = effectsOf(w, 'reflect');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.x).toBe(200);
    expect(countCells(w, 'material.crystal')).toBe(before);
  });

  it('a plain laser cuts dirt where crystal would have bounced it', () => {
    const w = flatWorld();
    const before = countCells(w);
    launchAt(w, 'weapon.laser', 120, 120, 4, 1, 400);
    expect(countCells(w)).toBeLessThan(before);
  });

  it('shatters under a blast and throws shards that land as loose terrain', () => {
    const w = slabWorld(190, 210, 110);
    const before = countCells(w, 'material.crystal');
    dropAt(w, 'weapon.missile', 200);
    expect(countCells(w, 'material.crystal')).toBeLessThan(before - 50);
    expect(countCells(w, 'material.crystal-shard')).toBeGreaterThan(10);
  });

  it('turns the Orbital Lance back: crystal overhead is cover', () => {
    const w = flatWorld();
    const g = w.grid;
    const c = w.mats.cellOf('material.crystal');
    // a crystal roof over column 200, a little above the ground
    for (let x = 185; x < 215; x++) for (let y = 100; y < 104; y++) g.set(x, y, c);
    g.clearSettle();
    g.clearReact();
    const dirtBefore = countCells(w, 'material.dirt');
    w.snapshot();
    launchAt(w, 'weapon.orbital-lance-beam', 200, 140, 0, 0, 900);
    expect(effectsOf(w, 'reflect').length).toBe(1);
    // nothing under the roof was bored or blasted
    expect(countCells(w, 'material.dirt')).toBe(dirtBefore);
    expect(countCells(w, 'material.crystal')).toBe(30 * 4);
  });
});

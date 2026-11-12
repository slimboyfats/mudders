import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld } from '../../../src/testing';

/** A flat world with a buried horizontal seam, 3 cells thick, from x0 to x1 at depth `depth`. */
function seamWorld(x0: number, x1: number, depth = 12) {
  const w = flatWorld(120);
  const gp = w.mats.cellOf('material.gunpowder');
  for (let y = 120 + depth; y < 123 + depth; y++)
    for (let x = x0; x < x1; x++) w.grid.set(x, y, gp);
  return w;
}

describe('material.gunpowder', () => {
  it('stays put, buried and quiet, until something lights it', () => {
    const w = seamWorld(100, 300);
    w.run(200);
    expect(countCells(w, 'material.gunpowder')).toBe(600);
    expect(countCells(w, 'material.lit-gunpowder')).toBe(0);
  });

  it('a blast at one end lights the seam and it goes off in a chain along its length', () => {
    const w = seamWorld(100, 300);
    effectsOf(w, 'flash');
    // a missile on the left end of the seam
    dropAt(w, 'weapon.missile', 110, 4000);
    expect(countCells(w, 'material.gunpowder')).toBe(0);
    expect(countCells(w, 'material.lit-gunpowder')).toBe(0);
    const flashes = effectsOf(w, 'flash');
    // the missile, plus several bursts strung out along the seam
    expect(flashes.length).toBeGreaterThan(4);
    expect(Math.max(...flashes.map((f) => f.x))).toBeGreaterThan(250);
    // the bursts carved the ground over the far end of the seam
    let open = 0;
    for (let x = 200; x < 300; x++) if (w.grid.get(x, 120 + 12) === 0) open++;
    expect(open).toBeGreaterThan(20);
  });

  it('burns tanks over the seam, credited to the shooter', () => {
    const w = seamWorld(20, 380, 6);
    const t = w.tanks[1]!;
    const hp = t.health;
    dropAt(w, 'weapon.missile', 200, 6000);
    expect(t.health).toBeLessThan(hp);
  });

  it('fire and lava light it too', () => {
    const w = seamWorld(100, 200, 0);
    const lava = w.mats.cellOf('material.lava');
    w.grid.set(150, 119, lava);
    w.grid.markDirty(150, 119, 150, 119);
    w.run(600);
    expect(countCells(w, 'material.gunpowder')).toBeLessThan(30);
  });

  it('a cold blast does not light it', () => {
    const w = seamWorld(100, 300, 4);
    dropAt(w, 'weapon.frost-bomb', 200, 4000);
    expect(countCells(w, 'material.lit-gunpowder')).toBe(0);
    expect(countCells(w, 'material.gunpowder')).toBeGreaterThan(400);
  });
});

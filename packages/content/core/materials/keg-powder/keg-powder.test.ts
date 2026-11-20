import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld } from '../../../src/testing';

function block(w: World, id: string): void {
  const g = w.grid;
  const m = w.mats.cellOf(id);
  for (let y = 140; y < 150; y++) for (let x = 190; x < 210; x++) g.material[y * g.width + x] = m;
  g.markDirty(190, 140, 209, 149);
}

/** Blasts set off by lighting a block of `id` with one small shell beside it. */
function booms(id: string): number {
  const w = flatWorld();
  block(w, id);
  w.run(5);
  effectsOf(w, 'shake');
  dropAt(w, 'weapon.baby-missile', 214, 1);
  let n = 0;
  for (let t = 0; t < 300; t++) {
    w.step();
    if (t % 10 === 0) n += effectsOf(w, 'shake').length;
  }
  return n + effectsOf(w, 'shake').length;
}

describe('material.keg-powder', () => {
  it('stands in a heap like gunpowder', () => {
    const w = flatWorld();
    block(w, 'material.keg-powder');
    w.run(200);
    expect(countCells(w, 'material.keg-powder')).toBe(200);
  });

  it('is lit by a nearby blast and goes off in more blasts than plain gunpowder', () => {
    const kegs = booms('material.keg-powder');
    expect(kegs).toBeGreaterThan(booms('material.gunpowder'));
    expect(kegs).toBeGreaterThan(4);
  });
});

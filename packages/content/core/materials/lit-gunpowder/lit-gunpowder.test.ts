import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.lit-gunpowder', () => {
  it('detonates with a small standard blast', () => {
    const m = loadContent().get('material', 'material.lit-gunpowder');
    expect(m.detonate?.explosion.ref).toBe('explosion.standard');
    expect(m.detonate?.explosion.radius).toBe(11);
  });

  it('burns out within a few ticks and keeps the shot resolving while it does', () => {
    const w = flatWorld(120);
    const lit = w.mats.cellOf('material.lit-gunpowder');
    w.grid.set(200, 119, lit);
    w.grid.markDirty(200, 119, 200, 119);
    expect(w.quiet).toBe(false);
    w.run(30);
    expect(countCells(w, 'material.lit-gunpowder')).toBe(0);
  });
});

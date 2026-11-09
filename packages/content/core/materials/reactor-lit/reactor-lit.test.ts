import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, flatWorld } from '../../../src/testing';

describe('material.reactor-lit', () => {
  it('detonates with a small standard blast', () => {
    const m = loadContent().get('material', 'material.reactor-lit');
    expect(m.detonate?.explosion.ref).toBe('explosion.standard');
    expect(m.detonate?.explosion.radius).toBe(9);
  });

  it('burns down to cinder and keeps the shot resolving while it does', () => {
    const w = flatWorld(150);
    const lit = w.mats.cellOf('material.reactor-lit');
    w.grid.set(200, 160, lit);
    w.grid.markDirty(200, 160, 200, 160);
    expect(w.quiet).toBe(false);
    w.run(40);
    expect(countCells(w, 'material.reactor-lit')).toBe(0);
  });
});

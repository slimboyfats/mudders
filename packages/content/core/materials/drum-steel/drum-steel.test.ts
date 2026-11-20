import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

/** Cells of `id` a baby missile blows out of a solid block of it. */
function loss(id: string): number {
  const w = flatWorld();
  const g = w.grid;
  const m = w.mats.cellOf(id);
  for (let y = 130; y < 150; y++) for (let x = 190; x < 210; x++) g.material[y * g.width + x] = m;
  g.markDirty(190, 130, 209, 149);
  const before = countCells(w, id);
  dropAt(w, 'weapon.baby-missile', 200);
  return before - countCells(w, id);
}

describe('material.drum-steel', () => {
  it('tears open far more easily than plain steel', () => {
    expect(loss('material.drum-steel')).toBeGreaterThan(2 * loss('material.steel'));
  });
});

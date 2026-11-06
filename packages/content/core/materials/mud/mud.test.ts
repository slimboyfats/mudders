import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

/** Depth of the crater at column x below the flat surface. */
function dent(w: ReturnType<typeof flatWorld>, x: number, surface: number): number {
  let d = 0;
  for (let y = surface; y < w.grid.height && w.grid.get(x, y) === 0; y++) d++;
  return d;
}

describe('material.mud', () => {
  it('compacts into packed mud', () => {
    const m = loadContent().get('material', 'material.mud');
    expect(m.compact?.into).toBe('material.packed-mud');
  });

  it('a missile leaves a shallower dent than in dirt, with a packed floor under it', () => {
    const dirt = flatWorld(120);
    const mud = flatWorld(120);
    mud.grid.material.fill(mud.mats.cellOf('material.mud'), 120 * mud.grid.width);
    dropAt(dirt, 'weapon.missile', 200);
    dropAt(mud, 'weapon.missile', 200);
    const dDirt = dent(dirt, 200, 120);
    const dMud = dent(mud, 200, 120);
    expect(dMud).toBeGreaterThan(3);
    expect(dMud).toBeLessThan(dDirt);
    const packed = mud.mats.cellOf('material.packed-mud');
    // the cell right under the dent is packed, and the layer is several cells thick
    expect(mud.grid.get(200, 120 + dMud)).toBe(packed);
    expect(mud.grid.get(200, 120 + dMud + 4)).toBe(packed);
    expect(countCells(mud, 'material.packed-mud')).toBeGreaterThan(100);
    // nothing else turns into packed mud, and dirt never compacts
    expect(countCells(dirt, 'material.packed-mud')).toBe(0);
  });

  it('packing stops at material that does not compact', () => {
    const w = flatWorld(120);
    const mud = w.mats.cellOf('material.mud');
    for (let y = 120; y < 126; y++) for (let x = 0; x < 400; x++) w.grid.set(x, y, mud);
    dropAt(w, 'weapon.missile', 200);
    for (let y = 126; y < w.grid.height; y++) {
      for (let x = 160; x < 240; x++)
        expect(w.grid.get(x, y)).not.toBe(w.mats.cellOf('material.packed-mud'));
    }
  });
});

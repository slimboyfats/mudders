import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('material.packed-mud', () => {
  it('a second shot into the same dent digs less than the first', () => {
    const w = flatWorld(120);
    w.grid.material.fill(w.mats.cellOf('material.mud'), 120 * w.grid.width);
    const depth = (): number => {
      let y = 120;
      while (w.grid.get(200, y) === 0) y++;
      return y;
    };
    dropAt(w, 'weapon.missile', 200);
    const first = depth() - 120;
    dropAt(w, 'weapon.missile', 200);
    const second = depth() - 120 - first;
    expect(first).toBeGreaterThan(3);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
  });
});

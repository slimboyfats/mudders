import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

function solid(m: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i] !== 0) n++;
  return n;
}

describe('terrainop.dirt-burst', () => {
  it('throws its cells up as debris and they all come back down as terrain', () => {
    const w = flatWorld(150, { tankColumns: [40, 560] });
    const before = solid(w.grid.material);
    dropAt(w, 'weapon.dirt-bomb', 300);
    // thousands of cells of new ground, none of it left floating
    expect(solid(w.grid.material) - before).toBeGreaterThan(3000);
    expect(w.debris.count).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.attract', () => {
  it('heaps loose ground into a mound on the impact point and drags tanks in', () => {
    const w = flatWorld(150, { tankColumns: [40, 240] });
    dropAt(w, 'weapon.implosion', 200);
    expect(w.grid.surfaceY(200)).toBeLessThan(145);
    expect(w.tanks[1]!.x).toBeLessThan(240);
  });
});

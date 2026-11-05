import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.terraform', () => {
  it('raises a tapered wall and lifts a tank standing on it', () => {
    const w = flatWorld(150, { tankColumns: [40, 200] });
    dropAt(w, 'weapon.terraformer', 200);
    expect(w.grid.surfaceY(200)).toBeLessThan(110);
    expect(w.grid.surfaceY(200 + 30)).toBe(150);
    expect(w.tanks[1]!.y).toBe(w.grid.surfaceY(200));
  });

  it('lowers a trench a tank drops into', () => {
    const w = flatWorld(150, { tankColumns: [40, 200] });
    dropAt(w, 'weapon.trencher', 200);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(185);
    expect(w.tanks[1]!.y).toBeGreaterThan(185);
  });
});

import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.dirt-bomb', () => {
  it('rains a wide blanket of dirt with banks either side that buries a nearby tank', () => {
    const w = flatWorld(150, { map: { width: 800, height: 300 }, tankColumns: [40, 450] });
    const ground = w.grid.surfaceY(100);
    dropAt(w, 'weapon.dirt-bomb', 400);
    // banks on both sides, a crater between them, and dirt far out on both sides
    expect(w.grid.surfaceY(350)).toBeLessThan(ground - 15);
    expect(w.grid.surfaceY(445)).toBeLessThan(ground - 15);
    expect(w.grid.surfaceY(400)).toBeGreaterThan(w.grid.surfaceY(350));
    expect(w.grid.surfaceY(270)).toBeLessThan(ground - 5);
    expect(w.grid.surfaceY(530)).toBeLessThan(ground - 5);
    // the tank 50 columns away is under the bank
    expect(w.grid.surfaceY(450)).toBeLessThan(w.tanks[1]!.y - 10);
    expect(w.debris.count).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { fireAndSettle, flatWorld } from '../../../src/testing';

describe('weapon.lightning', () => {
  it('strikes the highest enemy tank whatever the aim', () => {
    const w = flatWorld(150, {
      players: 3,
      tankColumns: [40, 200, 330],
      turnOrder: [0, 1, 2],
      tankSetup: [{ inventory: { 'weapon.lightning': 1 } }],
    });
    const g = w.grid;
    const dirt = w.mats.cellOf('material.dirt');
    for (let x = 310; x < 350; x++)
      for (let y = 110; y < 150; y++) g.material[y * g.width + x] = dirt;
    g.clearSettle();
    w.tanks[2]!.y = 110;
    fireAndSettle(w, 'weapon.lightning', 20, 100);
    expect(w.tanks[2]!.health).toBeLessThan(60);
    expect(w.tanks[1]!.health).toBe(100);
    expect(w.tanks[0]!.health).toBe(100);
  });
});

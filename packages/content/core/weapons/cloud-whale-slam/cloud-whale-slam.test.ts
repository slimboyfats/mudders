import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.cloud-whale-slam', () => {
  it('craters the ground and hurts the tank under it', () => {
    const w = flatWorld(150, { tankColumns: [20, 200] });
    dropAt(w, 'weapon.cloud-whale-slam', 200);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(160);
    expect(w.tanks[1]!.health).toBeLessThan(30);
  });
});

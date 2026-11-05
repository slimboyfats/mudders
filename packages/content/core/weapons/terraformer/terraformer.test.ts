import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.terraformer', () => {
  it('grows a wall with no damage', () => {
    const w = flatWorld(150, { tankColumns: [40, 200] });
    dropAt(w, 'weapon.terraformer', 200);
    expect(w.tanks[1]!.health).toBe(100);
    expect(w.grid.surfaceY(200)).toBeLessThan(110);
  });
});

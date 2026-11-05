import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.magma-bomb', () => {
  it('hurts a tank in the lava again at the end of the turn', () => {
    const w = flatWorld(150, { tankColumns: [40, 205] });
    dropAt(w, 'weapon.magma-bomb', 200);
    expect(w.tanks[1]!.health).toBeLessThan(100 - 20);
  });
});

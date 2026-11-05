import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.ton-of-dirt', () => {
  it('buries a tank', () => {
    const w = flatWorld(150, { tankColumns: [40, 200] });
    dropAt(w, 'weapon.ton-of-dirt', 200);
    expect(w.grid.surfaceY(200)).toBeLessThan(w.tanks[1]!.y - 10);
  });
});

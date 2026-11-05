import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.implosion', () => {
  it('builds a mound', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.implosion', 200);
    expect(w.grid.surfaceY(200)).toBeLessThan(150);
  });
});

import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.trencher', () => {
  it('digs a trench', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.trencher', 200);
    expect(w.grid.surfaceY(200)).toBeGreaterThan(185);
  });
});

import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('material.oil', () => {
  it('binds coated ground so a shockwave shoves it as a blob instead of scattering it', () => {
    const plain = flatWorld();
    dropAt(plain, 'weapon.shockwave', 200);
    const oiled = flatWorld();
    dropAt(oiled, 'weapon.oil-slick', 200);
    dropAt(oiled, 'weapon.shockwave', 200);
    expect(oiled.hash()).not.toBe(plain.hash());
    expect(oiled.mats.cohesion[oiled.mats.cellOf('material.oil')]).toBeGreaterThan(0);
  });
});

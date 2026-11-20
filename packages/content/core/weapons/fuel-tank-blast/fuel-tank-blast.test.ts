import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.fuel-tank-blast', () => {
  it('is a free sub-munition that is never sold, set off by a fuel tank vapour pocket', () => {
    const c = loadContent();
    const w = c.get('weapon', 'weapon.fuel-tank-blast');
    expect(w.shop.price).toBe(0);
    expect(w.meta.category).toBe('submunition');
    expect(c.get('material', 'material.fuel-vapour').burst?.weapon).toBe('weapon.fuel-tank-blast');
  });
});

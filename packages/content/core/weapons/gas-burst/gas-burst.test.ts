import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.gas-burst', () => {
  it('is a free sub-munition that is never sold, set off by gas pockets', () => {
    const c = loadContent();
    const w = c.get('weapon', 'weapon.gas-burst');
    expect(w.shop.price).toBe(0);
    expect(w.meta.category).toBe('submunition');
    expect(c.get('material', 'material.gas-pocket').burst?.weapon).toBe('weapon.gas-burst');
  });
});

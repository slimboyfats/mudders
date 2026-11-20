import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.pylon-short', () => {
  it('is a free sub-munition that is never sold, set off by a transformer shorting out', () => {
    const c = loadContent();
    const w = c.get('weapon', 'weapon.pylon-short');
    expect(w.shop.price).toBe(0);
    expect(w.meta.category).toBe('submunition');
    expect(c.get('material', 'material.transformer').burst?.weapon).toBe('weapon.pylon-short');
  });
});

import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.flying-barrel', () => {
  it('is a free sub-munition that is never sold, launched by a fuel barrel bursting', () => {
    const c = loadContent();
    const w = c.get('weapon', 'weapon.flying-barrel');
    expect(w.shop.price).toBe(0);
    expect(w.meta.category).toBe('submunition');
  });
});

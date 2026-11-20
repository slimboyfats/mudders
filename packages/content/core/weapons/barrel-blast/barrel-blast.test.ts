import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.barrel-blast', () => {
  it('is a free sub-munition that is never sold, set off by barrel fuel when its drum is opened', () => {
    const c = loadContent();
    const w = c.get('weapon', 'weapon.barrel-blast');
    expect(w.shop.price).toBe(0);
    expect(w.meta.category).toBe('submunition');
  });
});

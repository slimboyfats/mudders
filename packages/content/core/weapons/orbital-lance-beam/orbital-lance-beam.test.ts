import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.orbital-lance-beam', () => {
  it('is a free sub-munition that is never sold', () => {
    const w = loadContent().get('weapon', 'weapon.orbital-lance-beam');
    expect(w.shop.price).toBe(0);
    expect(w.meta.category).toBe('submunition');
    expect(w.pulse?.length).toBe(3);
  });
});

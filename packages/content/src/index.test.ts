import { describe, expect, it } from 'vitest';
import { loadContent } from './index';

describe('content packs', () => {
  it('loads and resolves the core pack', () => {
    const c = loadContent();
    expect(c.packs.map((p) => p.name)).toEqual(['core']);
    expect(c.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(c.list('weapon').map((w) => w.id)).toEqual([
      'weapon.baby-missile',
      'weapon.missile',
      'weapon.shockwave',
    ]);
  });
});

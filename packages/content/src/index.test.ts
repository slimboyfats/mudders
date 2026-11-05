import { describe, expect, it } from 'vitest';
import { loadContent } from './index';

describe('content packs', () => {
  it('loads and resolves the core pack', () => {
    const c = loadContent();
    expect(c.packs.map((p) => p.name)).toEqual(['core']);
    expect(c.hash).toMatch(/^[0-9a-f]{16}$/);
    const weapons = c.list('weapon').map((w) => w.id);
    expect(weapons).toEqual([...weapons].sort());
    expect(weapons.length).toBeGreaterThanOrEqual(15);
    for (const id of [
      'weapon.shockwave',
      'weapon.quicksand',
      'weapon.terraformer',
      'weapon.magma-bomb',
    ])
      expect(weapons).toContain(id);
  });
});

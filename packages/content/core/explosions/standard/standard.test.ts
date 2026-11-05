import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('explosion.standard', () => {
  it('carves and deals linear blast damage', () => {
    const e = loadContent().get('explosion', 'explosion.standard');
    expect(e).toMatchObject({ damageType: 'blast', falloff: 'linear', push: 0 });
    expect(e.terrainOp).toMatchObject({ ref: 'terrainop.carve' });
    expect(Object.keys(e.effects)).toContain('burst');
  });
});

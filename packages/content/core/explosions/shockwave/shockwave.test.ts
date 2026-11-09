import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('explosion.shockwave', () => {
  it('displaces instead of carving and throws tanks', () => {
    const e = loadContent().get('explosion', 'explosion.shockwave');
    expect(e.terrainOp).toMatchObject({ ref: 'terrainop.displace' });
    expect(e.damageType).toBe('shock');
    expect(e.push).toBe(0);
    // the ring throws tanks itself, when its front reaches them
    expect(e.terrainOp?.['fling']).toBeGreaterThan(0);
  });
});

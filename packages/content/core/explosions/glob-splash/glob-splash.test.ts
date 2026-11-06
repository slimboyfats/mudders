import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('explosion.glob-splash', () => {
  it('is a small hot splash that digs no crater', () => {
    const e = loadContent().get('explosion', 'explosion.glob-splash');
    expect(e.terrainOp).toBeNull();
    expect(e.damageType).toBe('heat');
    expect(e.radius).toBeLessThan(8);
  });
});

import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('explosion.flask-smash', () => {
  it('is a tiny glass burst that digs no crater and barely hurts', () => {
    const e = loadContent().get('explosion', 'explosion.flask-smash');
    expect(e.terrainOp).toBeNull();
    expect(e.radius).toBeLessThanOrEqual(4);
    expect(e.damage).toBeLessThanOrEqual(3);
  });
});

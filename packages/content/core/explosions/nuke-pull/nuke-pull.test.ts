import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('explosion.nuke-pull', () => {
  it('pulls the ground in and does no damage', () => {
    const e = loadContent().get('explosion', 'explosion.nuke-pull');
    expect(e.terrainOp).toMatchObject({ ref: 'terrainop.attract' });
    expect(e.damage).toBe(0);
  });
});

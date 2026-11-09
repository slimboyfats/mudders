import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.rogue-hole-bite', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.rogue-hole-bite')).toBe(true);
  });
});

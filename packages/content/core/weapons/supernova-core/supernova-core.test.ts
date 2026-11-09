import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.supernova-core', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.supernova-core')).toBe(true);
  });
});

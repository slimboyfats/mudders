import { describe, expect, it } from 'vitest';
import { packs } from './index';

describe('content packs', () => {
  it('ships the core pack with a semver version', () => {
    const core = packs.find((p) => p.name === 'core');
    expect(core?.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

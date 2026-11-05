import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('theme.default', () => {
  it('loads with a full sky, light and ambient set', () => {
    const t = loadContent().get('theme', 'theme.default');
    expect(t.sky.top).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.sky.bottom).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.ambient.kind).toBe('stars');
  });
});
